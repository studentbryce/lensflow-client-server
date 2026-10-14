


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."booking_status" AS ENUM (
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'declined'
);


ALTER TYPE "public"."booking_status" OWNER TO "postgres";


CREATE TYPE "public"."calendar_provider" AS ENUM (
    'google'
);


ALTER TYPE "public"."calendar_provider" OWNER TO "postgres";


CREATE TYPE "public"."invoice_status" AS ENUM (
    'draft',
    'sent',
    'paid',
    'overdue',
    'cancelled'
);


ALTER TYPE "public"."invoice_status" OWNER TO "postgres";


CREATE TYPE "public"."media_type" AS ENUM (
    'image',
    'video'
);


ALTER TYPE "public"."media_type" OWNER TO "postgres";


CREATE TYPE "public"."payment_status" AS ENUM (
    'pending',
    'successful',
    'failed',
    'refunded'
);


ALTER TYPE "public"."payment_status" OWNER TO "postgres";


CREATE TYPE "public"."review_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."review_status" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'photographer',
    'client'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_client_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT client_id
    FROM public.clients
    WHERE user_id = (SELECT auth.uid())
    LIMIT 1;
$$;


ALTER FUNCTION "private"."current_client_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."current_photographer_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT photographer_id
    FROM public.photographer_profiles
    WHERE user_id = (SELECT auth.uid())
    LIMIT 1;
$$;


ALTER FUNCTION "private"."current_photographer_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_client"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = (SELECT auth.uid())
          AND role = 'client'
    );
$$;


ALTER FUNCTION "private"."is_client"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_photographer"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE user_id = (SELECT auth.uid())
          AND role = 'photographer'
    );
$$;


ALTER FUNCTION "private"."is_photographer"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."owns_client"("requested_client_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.clients
        WHERE client_id = requested_client_id
          AND user_id = (SELECT auth.uid())
    );
$$;


ALTER FUNCTION "private"."owns_client"("requested_client_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."owns_photographer"("requested_photographer_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.photographer_profiles
        WHERE photographer_id = requested_photographer_id
          AND user_id = (SELECT auth.uid())
    );
$$;


ALTER FUNCTION "private"."owns_photographer"("requested_photographer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."protect_message_update"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN

    -- Message identity cannot change.

    IF NEW.message_id IS DISTINCT FROM OLD.message_id THEN
        RAISE EXCEPTION
            'message_id cannot be changed';
    END IF;


    -- Conversation cannot change.

    IF NEW.conversation_id
        IS DISTINCT FROM OLD.conversation_id
    THEN
        RAISE EXCEPTION
            'conversation_id cannot be changed';
    END IF;


    -- Sender cannot change.

    IF NEW.sender_id
        IS DISTINCT FROM OLD.sender_id
    THEN
        RAISE EXCEPTION
            'sender_id cannot be changed';
    END IF;


    -- Sent message content cannot be edited.

    IF NEW.message
        IS DISTINCT FROM OLD.message
    THEN
        RAISE EXCEPTION
            'sent messages cannot be edited';
    END IF;


    -- Original timestamp cannot change.

    IF NEW.created_at
        IS DISTINCT FROM OLD.created_at
    THEN
        RAISE EXCEPTION
            'created_at cannot be changed';
    END IF;


    -- Once read, a message cannot become unread again.

    IF OLD.is_read = true
       AND NEW.is_read = false
    THEN
        RAISE EXCEPTION
            'read messages cannot be marked unread';
    END IF;


    RETURN NEW;

END;
$$;


ALTER FUNCTION "private"."protect_message_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."remove_unpublished_featured_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    IF OLD.status = 'approved'::public.review_status
       AND NEW.status <> 'approved'::public.review_status
    THEN
        DELETE FROM public.website_featured_reviews
        WHERE review_id = NEW.review_id
          AND photographer_id = NEW.photographer_id;
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."remove_unpublished_featured_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."touch_conversation_from_message"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN

    UPDATE public.conversations
    SET updated_at = NEW.created_at
    WHERE conversation_id =
          NEW.conversation_id;

    RETURN NEW;

END;
$$;


ALTER FUNCTION "private"."touch_conversation_from_message"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."validate_featured_review"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.reviews r
        WHERE r.review_id = NEW.review_id
          AND r.photographer_id = NEW.photographer_id
          AND r.status = 'approved'::public.review_status
    ) THEN
        RAISE EXCEPTION
            'Only approved reviews belonging to this photographer can be featured';
    END IF;

    RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."validate_featured_review"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_booking_busy_times"("p_photographer_id" "uuid", "p_date" "date") RETURNS TABLE("start_time" time without time zone, "end_time" time without time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF auth.uid() IS NULL OR p_photographer_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Not authorised to check this schedule' USING ERRCODE = '42501';
  END IF;

  -- Only the photographer or a client linked to that photographer may request
  -- occupied times. SECURITY DEFINER can see all booking rows without changing RLS.
  IF NOT EXISTS (
    SELECT 1 FROM public.photographer_profiles p
    WHERE p.photographer_id = p_photographer_id AND p.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.photographer_id = p_photographer_id AND c.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorised to check this schedule' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT b.start_time, b.end_time
  FROM public.bookings b
  WHERE b.photographer_id = p_photographer_id
    AND b.booking_date = p_date
    AND b.status IN ('pending'::public.booking_status, 'confirmed'::public.booking_status)
  ORDER BY b.start_time;
END;
$$;


ALTER FUNCTION "public"."get_booking_busy_times"("p_photographer_id" "uuid", "p_date" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_featured_reviews"("p_photographer_id" "uuid") RETURNS TABLE("review_id" "uuid", "photographer_id" "uuid", "rating" smallint, "comment" "text", "created_at" timestamp with time zone, "display_name" "text", "display_order" smallint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$

    select
        r.review_id,
        r.photographer_id,
        r.rating,
        r.comment,
        r.created_at,

        case
            when nullif(trim(p.first_name), '') is null
                then 'Photography Client'

            when nullif(trim(p.last_name), '') is null
                then trim(p.first_name)

            else
                trim(p.first_name)
                || ' '
                || upper(left(trim(p.last_name), 1))
                || '.'
        end as display_name,

        f.display_order

    from public.website_featured_reviews f

    join public.reviews r
        on r.review_id = f.review_id
       and r.photographer_id = f.photographer_id

    join public.clients c
        on c.client_id = r.client_id

    join public.profiles p
        on p.user_id = c.user_id

    where f.photographer_id = p_photographer_id
      and r.status = 'approved'::public.review_status

      and exists (
          select 1
          from public.photographer_profiles pp
          where pp.photographer_id = f.photographer_id
            and pp.published = true
      )

    order by f.display_order asc
    limit 3;

$$;


ALTER FUNCTION "public"."get_featured_reviews"("p_photographer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_reviews"("p_photographer_id" "uuid") RETURNS TABLE("review_id" "uuid", "photographer_id" "uuid", "rating" smallint, "comment" "text", "created_at" timestamp with time zone, "display_name" "text")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$

    select
        r.review_id,
        r.photographer_id,
        r.rating,
        r.comment,
        r.created_at,

        case
            when nullif(trim(p.first_name), '') is null
                then 'Photography Client'

            when nullif(trim(p.last_name), '') is null
                then trim(p.first_name)

            else
                trim(p.first_name)
                || ' '
                || upper(left(trim(p.last_name), 1))
                || '.'
        end as display_name

    from public.reviews r

    join public.clients c
        on c.client_id = r.client_id

    join public.profiles p
        on p.user_id = c.user_id

    where r.photographer_id = p_photographer_id
      and r.status = 'approved'::public.review_status

      and exists (
          select 1
          from public.photographer_profiles pp
          where pp.photographer_id = r.photographer_id
            and pp.published = true
      )

    order by r.created_at desc;

$$;


ALTER FUNCTION "public"."get_public_reviews"("p_photographer_id" "uuid") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "review_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "rating" smallint NOT NULL,
    "comment" "text",
    "status" "public"."review_status" DEFAULT 'pending'::"public"."review_status" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reviews_rating_valid" CHECK ((("rating" >= 1) AND ("rating" <= 5)))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_review"("p_review_id" "uuid", "p_status" "public"."review_status") RETURNS "public"."reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_review public.reviews;
    v_photographer_id uuid;
BEGIN
    -- Only moderation outcomes are accepted.
    IF p_status NOT IN (
        'approved'::public.review_status,
        'rejected'::public.review_status
    ) THEN
        RAISE EXCEPTION 'Invalid review moderation status';
    END IF;

    -- Find the photographer belonging to the authenticated user.
    SELECT pp.photographer_id
    INTO v_photographer_id
    FROM public.photographer_profiles pp
    WHERE pp.user_id = (SELECT auth.uid())
    LIMIT 1;

    IF v_photographer_id IS NULL THEN
        RAISE EXCEPTION 'Photographer profile not found';
    END IF;

    -- Update only the moderation status.
    UPDATE public.reviews
    SET status = p_status
    WHERE review_id = p_review_id
      AND photographer_id = v_photographer_id
    RETURNING *
    INTO v_review;

    IF v_review.review_id IS NULL THEN
        RAISE EXCEPTION 'Review not found or access denied';
    END IF;

    RETURN v_review;
END;
$$;


ALTER FUNCTION "public"."moderate_review"("p_review_id" "uuid", "p_status" "public"."review_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = pg_catalog.now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_pending_review"("p_review_id" "uuid", "p_rating" smallint, "p_comment" "text") RETURNS "public"."reviews"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_review public.reviews;
    v_client_id uuid;
BEGIN
    -- Validate rating explicitly.
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Rating must be between 1 and 5';
    END IF;

    -- Identify the currently authenticated client.
    SELECT c.client_id
    INTO v_client_id
    FROM public.clients c
    WHERE c.user_id = (SELECT auth.uid())
    LIMIT 1;

    IF v_client_id IS NULL THEN
        RAISE EXCEPTION 'Client profile not found';
    END IF;

    -- Update only fields that a client is allowed to edit.
    UPDATE public.reviews
    SET
        rating = p_rating,
        comment = NULLIF(BTRIM(p_comment), '')
    WHERE review_id = p_review_id
      AND client_id = v_client_id
      AND status = 'pending'::public.review_status
    RETURNING *
    INTO v_review;

    IF v_review.review_id IS NULL THEN
        RAISE EXCEPTION
            'Review not found, access denied, or review is no longer pending';
    END IF;

    RETURN v_review;
END;
$$;


ALTER FUNCTION "public"."update_pending_review"("p_review_id" "uuid", "p_rating" smallint, "p_comment" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_exceptions" (
    "exception_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "exception_date" "date" NOT NULL,
    "start_time" time without time zone,
    "end_time" time without time zone,
    "is_available" boolean DEFAULT false NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "availability_exceptions_time_valid" CHECK ((("start_time" IS NULL) OR ("end_time" IS NULL) OR ("start_time" < "end_time")))
);


ALTER TABLE "public"."availability_exceptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."availability_rules" (
    "availability_rule_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "day_of_week" smallint NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "availability_rules_day_valid" CHECK ((("day_of_week" >= 0) AND ("day_of_week" <= 6))),
    CONSTRAINT "availability_rules_time_valid" CHECK (("start_time" < "end_time"))
);


ALTER TABLE "public"."availability_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "booking_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "service_id" "uuid" NOT NULL,
    "booking_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "location" "text",
    "notes" "text",
    "status" "public"."booking_status" DEFAULT 'pending'::"public"."booking_status" NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bookings_time_valid" CHECK (("start_time" < "end_time")),
    CONSTRAINT "bookings_total_non_negative" CHECK (("total_amount" >= (0)::numeric)),
    CONSTRAINT "bookings_valid_time_range" CHECK (("start_time" < "end_time"))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."calendar_integrations" (
    "integration_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "provider" "public"."calendar_provider" DEFAULT 'google'::"public"."calendar_provider" NOT NULL,
    "calendar_id" character varying(255),
    "access_token" "text",
    "refresh_token" "text",
    "token_expires_at" timestamp with time zone,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."calendar_integrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clients" (
    "client_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."clients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."conversations" (
    "conversation_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."galleries" (
    "gallery_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "name" character varying(150) NOT NULL,
    "description" "text",
    "is_published" boolean DEFAULT false NOT NULL,
    "allow_downloads" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."galleries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoice_items" (
    "invoice_item_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "service_id" "uuid",
    "description" "text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "unit_price" numeric(12,2) DEFAULT 0 NOT NULL,
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "invoice_items_quantity_positive" CHECK (("quantity" > 0)),
    CONSTRAINT "invoice_items_subtotal_non_negative" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "invoice_items_unit_price_non_negative" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."invoice_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "invoice_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "invoice_number" character varying(50) NOT NULL,
    "issue_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "due_date" "date",
    "subtotal" numeric(12,2) DEFAULT 0 NOT NULL,
    "tax_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "status" "public"."invoice_status" DEFAULT 'draft'::"public"."invoice_status" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tax_rate" numeric(5,2) DEFAULT 15.00 NOT NULL,
    "tax_included" boolean DEFAULT false NOT NULL,
    "tax_number" character varying(100),
    "bank_account_name" character varying(150),
    "bank_name" character varying(150),
    "bank_account_number" character varying(100),
    "bank_payment_instructions" "text",
    CONSTRAINT "invoices_due_date_valid" CHECK ((("due_date" IS NULL) OR ("due_date" >= "issue_date"))),
    CONSTRAINT "invoices_subtotal_non_negative" CHECK (("subtotal" >= (0)::numeric)),
    CONSTRAINT "invoices_tax_non_negative" CHECK (("tax_amount" >= (0)::numeric)),
    CONSTRAINT "invoices_total_non_negative" CHECK (("total_amount" >= (0)::numeric))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media" (
    "media_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "gallery_id" "uuid" NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "file_name" character varying(255) NOT NULL,
    "storage_path" "text" NOT NULL,
    "media_type" "public"."media_type" NOT NULL,
    "mime_type" character varying(100),
    "file_size" bigint,
    "thumbnail_path" "text",
    "is_downloadable" boolean DEFAULT true NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "media_file_size_non_negative" CHECK ((("file_size" IS NULL) OR ("file_size" >= 0)))
);


ALTER TABLE "public"."media" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."media_favourites" (
    "favourite_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "media_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."media_favourites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages" (
    "message_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "notification_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "type" character varying(50) NOT NULL,
    "title" character varying(150) NOT NULL,
    "message" "text" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "payment_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invoice_id" "uuid" NOT NULL,
    "client_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "currency" character(3) DEFAULT 'NZD'::"bpchar" NOT NULL,
    "payment_method" character varying(50),
    "stripe_payment_id" character varying(255),
    "status" "public"."payment_status" DEFAULT 'pending'::"public"."payment_status" NOT NULL,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stripe_account_id" character varying(255),
    "stripe_checkout_session_id" character varying(255),
    "stripe_payment_intent_id" character varying(255),
    "stripe_charge_id" character varying(255),
    CONSTRAINT "payments_amount_positive" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_payment_settings" (
    "photographer_id" "uuid" NOT NULL,
    "bank_account_name" character varying(150),
    "bank_name" character varying(150),
    "bank_account_number" character varying(100),
    "bank_payment_instructions" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "gst_tax_number" character varying(100),
    "default_tax_rate" numeric(5,2) DEFAULT 15.00 NOT NULL,
    CONSTRAINT "photographer_payment_settings_gst_number_not_blank" CHECK ((("gst_tax_number" IS NULL) OR ("length"(TRIM(BOTH FROM "gst_tax_number")) > 0))),
    CONSTRAINT "photographer_payment_settings_tax_rate_check" CHECK ((("default_tax_rate" >= (0)::numeric) AND ("default_tax_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."photographer_payment_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_profiles" (
    "photographer_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "business_name" character varying(150) NOT NULL,
    "slug" character varying(100) NOT NULL,
    "description" "text",
    "email" character varying(255) NOT NULL,
    "phone" character varying(30),
    "website_url" "text",
    "logo_url" "text",
    "profile_image_url" "text",
    "address" "text",
    "published" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."photographer_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."photographer_stripe_accounts" (
    "photographer_id" "uuid" NOT NULL,
    "stripe_account_id" character varying(255) NOT NULL,
    "charges_enabled" boolean DEFAULT false NOT NULL,
    "payouts_enabled" boolean DEFAULT false NOT NULL,
    "details_submitted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."photographer_stripe_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."portfolio_items" (
    "portfolio_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "title" character varying(150) NOT NULL,
    "description" "text",
    "media_url" "text" NOT NULL,
    "thumbnail_url" "text",
    "category" character varying(100),
    "display_order" integer DEFAULT 0 NOT NULL,
    "published" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_media_id" "uuid"
);


ALTER TABLE "public"."portfolio_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "user_id" "uuid" NOT NULL,
    "role" "public"."user_role" NOT NULL,
    "first_name" character varying(100) NOT NULL,
    "last_name" character varying(100) NOT NULL,
    "email" character varying(255) NOT NULL,
    "phone" character varying(30),
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."services" (
    "service_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "name" character varying(150) NOT NULL,
    "description" "text",
    "price" numeric(12,2) DEFAULT 0 NOT NULL,
    "duration_minutes" integer NOT NULL,
    "deposit_amount" numeric(12,2) DEFAULT 0 NOT NULL,
    "image_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "services_deposit_non_negative" CHECK (("deposit_amount" >= (0)::numeric)),
    CONSTRAINT "services_duration_positive" CHECK (("duration_minutes" > 0)),
    CONSTRAINT "services_price_non_negative" CHECK (("price" >= (0)::numeric))
);


ALTER TABLE "public"."services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_content" (
    "content_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "section" character varying(50) NOT NULL,
    "title" character varying(150),
    "content" "text",
    "image_url" "text",
    "display_order" integer DEFAULT 0 NOT NULL,
    "published" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."website_content" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_featured_reviews" (
    "photographer_id" "uuid" NOT NULL,
    "review_id" "uuid" NOT NULL,
    "display_order" smallint NOT NULL,
    CONSTRAINT "website_featured_reviews_order_check" CHECK ((("display_order" >= 1) AND ("display_order" <= 3)))
);


ALTER TABLE "public"."website_featured_reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."website_settings" (
    "website_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "photographer_id" "uuid" NOT NULL,
    "theme" character varying(50),
    "primary_colour" character varying(20),
    "secondary_colour" character varying(20),
    "font_family" character varying(100),
    "hero_title" character varying(150),
    "hero_description" "text",
    "hero_image_url" "text",
    "show_about" boolean DEFAULT true NOT NULL,
    "show_services" boolean DEFAULT true NOT NULL,
    "show_portfolio" boolean DEFAULT true NOT NULL,
    "show_reviews" boolean DEFAULT true NOT NULL,
    "show_contact" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "heading_font" character varying(100),
    "body_font" character varying(100),
    "navigation_font" character varying(100)
);


ALTER TABLE "public"."website_settings" OWNER TO "postgres";


ALTER TABLE ONLY "public"."availability_exceptions"
    ADD CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("exception_id");



ALTER TABLE ONLY "public"."availability_rules"
    ADD CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("availability_rule_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_no_active_overlap" EXCLUDE USING "gist" ("photographer_id" WITH =, "booking_date" WITH =, "tsrange"(("booking_date" + "start_time"), ("booking_date" + "end_time"), '[)'::"text") WITH &&) WHERE (("status" = ANY (ARRAY['pending'::"public"."booking_status", 'confirmed'::"public"."booking_status"])));



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_photographer_booking_unique" UNIQUE ("photographer_id", "booking_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_photographer_client_booking_unique" UNIQUE ("photographer_id", "client_id", "booking_id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("booking_id");



ALTER TABLE ONLY "public"."calendar_integrations"
    ADD CONSTRAINT "calendar_integrations_pkey" PRIMARY KEY ("integration_id");



ALTER TABLE ONLY "public"."calendar_integrations"
    ADD CONSTRAINT "calendar_integrations_provider_unique" UNIQUE ("photographer_id", "provider");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_photographer_client_unique" UNIQUE ("photographer_id", "client_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_pkey" PRIMARY KEY ("client_id");



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_photographer_client_unique" UNIQUE ("photographer_id", "client_id");



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_pkey" PRIMARY KEY ("conversation_id");



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_booking_unique" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_photographer_gallery_unique" UNIQUE ("photographer_id", "gallery_id");



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_pkey" PRIMARY KEY ("gallery_id");



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("invoice_item_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_booking_unique" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_number_unique" UNIQUE ("invoice_number");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_photographer_client_invoice_unique" UNIQUE ("photographer_id", "client_id", "invoice_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_photographer_invoice_unique" UNIQUE ("photographer_id", "invoice_id");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("invoice_id");



ALTER TABLE ONLY "public"."media_favourites"
    ADD CONSTRAINT "media_favourites_pkey" PRIMARY KEY ("favourite_id");



ALTER TABLE ONLY "public"."media_favourites"
    ADD CONSTRAINT "media_favourites_unique" UNIQUE ("media_id", "client_id");



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_pkey" PRIMARY KEY ("media_id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("message_id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_checkout_session_unique" UNIQUE ("stripe_checkout_session_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_stripe_id_unique" UNIQUE ("stripe_payment_id");



ALTER TABLE ONLY "public"."photographer_payment_settings"
    ADD CONSTRAINT "photographer_payment_settings_pkey" PRIMARY KEY ("photographer_id");



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_pkey" PRIMARY KEY ("photographer_id");



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_user_unique" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."photographer_stripe_accounts"
    ADD CONSTRAINT "photographer_stripe_accounts_pkey" PRIMARY KEY ("photographer_id");



ALTER TABLE ONLY "public"."photographer_stripe_accounts"
    ADD CONSTRAINT "photographer_stripe_accounts_stripe_account_id_key" UNIQUE ("stripe_account_id");



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_photographer_display_order_unique" UNIQUE ("photographer_id", "display_order");



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_pkey" PRIMARY KEY ("portfolio_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_unique" UNIQUE ("booking_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_photographer_review_unique" UNIQUE ("photographer_id", "review_id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("review_id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_photographer_service_unique" UNIQUE ("photographer_id", "service_id");



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("service_id");



ALTER TABLE ONLY "public"."website_content"
    ADD CONSTRAINT "website_content_pkey" PRIMARY KEY ("content_id");



ALTER TABLE ONLY "public"."website_featured_reviews"
    ADD CONSTRAINT "website_featured_reviews_order_unique" UNIQUE ("photographer_id", "display_order");



ALTER TABLE ONLY "public"."website_featured_reviews"
    ADD CONSTRAINT "website_featured_reviews_pkey" PRIMARY KEY ("photographer_id", "review_id");



ALTER TABLE ONLY "public"."website_settings"
    ADD CONSTRAINT "website_settings_photographer_unique" UNIQUE ("photographer_id");



ALTER TABLE ONLY "public"."website_settings"
    ADD CONSTRAINT "website_settings_pkey" PRIMARY KEY ("website_id");



CREATE INDEX "idx_availability_exceptions_photographer_date" ON "public"."availability_exceptions" USING "btree" ("photographer_id", "exception_date");



CREATE INDEX "idx_availability_rules_day" ON "public"."availability_rules" USING "btree" ("photographer_id", "day_of_week");



CREATE INDEX "idx_availability_rules_photographer" ON "public"."availability_rules" USING "btree" ("photographer_id");



CREATE INDEX "idx_bookings_client" ON "public"."bookings" USING "btree" ("client_id");



CREATE INDEX "idx_bookings_date" ON "public"."bookings" USING "btree" ("photographer_id", "booking_date");



CREATE INDEX "idx_bookings_photographer" ON "public"."bookings" USING "btree" ("photographer_id");



CREATE INDEX "idx_bookings_service" ON "public"."bookings" USING "btree" ("service_id");



CREATE INDEX "idx_bookings_status" ON "public"."bookings" USING "btree" ("photographer_id", "status");



CREATE INDEX "idx_calendar_integrations_photographer" ON "public"."calendar_integrations" USING "btree" ("photographer_id");



CREATE INDEX "idx_clients_photographer" ON "public"."clients" USING "btree" ("photographer_id");



CREATE INDEX "idx_clients_user" ON "public"."clients" USING "btree" ("user_id");



CREATE INDEX "idx_conversations_client" ON "public"."conversations" USING "btree" ("client_id");



CREATE INDEX "idx_conversations_photographer" ON "public"."conversations" USING "btree" ("photographer_id");



CREATE INDEX "idx_galleries_booking" ON "public"."galleries" USING "btree" ("booking_id");



CREATE INDEX "idx_galleries_client" ON "public"."galleries" USING "btree" ("client_id");



CREATE INDEX "idx_galleries_photographer" ON "public"."galleries" USING "btree" ("photographer_id");



CREATE INDEX "idx_galleries_published" ON "public"."galleries" USING "btree" ("client_id", "is_published");



CREATE INDEX "idx_invoice_items_invoice" ON "public"."invoice_items" USING "btree" ("invoice_id");



CREATE INDEX "idx_invoice_items_photographer" ON "public"."invoice_items" USING "btree" ("photographer_id");



CREATE INDEX "idx_invoice_items_service" ON "public"."invoice_items" USING "btree" ("service_id");



CREATE INDEX "idx_invoices_booking" ON "public"."invoices" USING "btree" ("booking_id");



CREATE INDEX "idx_invoices_client" ON "public"."invoices" USING "btree" ("client_id");



CREATE INDEX "idx_invoices_photographer" ON "public"."invoices" USING "btree" ("photographer_id");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("photographer_id", "status");



CREATE INDEX "idx_media_favourites_client" ON "public"."media_favourites" USING "btree" ("client_id");



CREATE INDEX "idx_media_favourites_media" ON "public"."media_favourites" USING "btree" ("media_id");



CREATE INDEX "idx_media_gallery" ON "public"."media" USING "btree" ("gallery_id");



CREATE INDEX "idx_media_photographer" ON "public"."media" USING "btree" ("photographer_id");



CREATE INDEX "idx_messages_conversation" ON "public"."messages" USING "btree" ("conversation_id", "created_at");



CREATE INDEX "idx_messages_sender" ON "public"."messages" USING "btree" ("sender_id");



CREATE INDEX "idx_messages_unread" ON "public"."messages" USING "btree" ("conversation_id", "sender_id", "created_at" DESC) WHERE ("is_read" = false);



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read");



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "idx_payments_client" ON "public"."payments" USING "btree" ("client_id");



CREATE INDEX "idx_payments_invoice" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("invoice_id", "status");



CREATE INDEX "idx_photographer_profiles_slug" ON "public"."photographer_profiles" USING "btree" ("slug");



CREATE INDEX "idx_portfolio_items_source_media_id" ON "public"."portfolio_items" USING "btree" ("source_media_id");



CREATE INDEX "idx_portfolio_photographer" ON "public"."portfolio_items" USING "btree" ("photographer_id");



CREATE INDEX "idx_portfolio_published" ON "public"."portfolio_items" USING "btree" ("photographer_id", "published");



CREATE INDEX "idx_profiles_role" ON "public"."profiles" USING "btree" ("role");



CREATE INDEX "idx_reviews_client" ON "public"."reviews" USING "btree" ("client_id");



CREATE INDEX "idx_reviews_photographer" ON "public"."reviews" USING "btree" ("photographer_id");



CREATE INDEX "idx_services_active" ON "public"."services" USING "btree" ("photographer_id", "is_active");



CREATE INDEX "idx_services_photographer" ON "public"."services" USING "btree" ("photographer_id");



CREATE INDEX "idx_website_content_order" ON "public"."website_content" USING "btree" ("photographer_id", "display_order");



CREATE INDEX "idx_website_content_photographer" ON "public"."website_content" USING "btree" ("photographer_id");



CREATE UNIQUE INDEX "payments_one_pending_per_invoice" ON "public"."payments" USING "btree" ("invoice_id") WHERE ("status" = 'pending'::"public"."payment_status");



CREATE UNIQUE INDEX "payments_one_successful_per_invoice" ON "public"."payments" USING "btree" ("invoice_id") WHERE ("status" = 'successful'::"public"."payment_status");



CREATE OR REPLACE TRIGGER "availability_exceptions_updated_at" BEFORE UPDATE ON "public"."availability_exceptions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "availability_rules_updated_at" BEFORE UPDATE ON "public"."availability_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "bookings_updated_at" BEFORE UPDATE ON "public"."bookings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "calendar_integrations_updated_at" BEFORE UPDATE ON "public"."calendar_integrations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "clients_updated_at" BEFORE UPDATE ON "public"."clients" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "conversations_updated_at" BEFORE UPDATE ON "public"."conversations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "galleries_updated_at" BEFORE UPDATE ON "public"."galleries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "invoices_updated_at" BEFORE UPDATE ON "public"."invoices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photographer_payment_settings_updated_at" BEFORE UPDATE ON "public"."photographer_payment_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "photographer_profiles_updated_at" BEFORE UPDATE ON "public"."photographer_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "portfolio_items_updated_at" BEFORE UPDATE ON "public"."portfolio_items" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "protect_message_update_trigger" BEFORE UPDATE ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."protect_message_update"();



CREATE OR REPLACE TRIGGER "remove_unpublished_featured_review" AFTER UPDATE OF "status" ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "private"."remove_unpublished_featured_review"();



CREATE OR REPLACE TRIGGER "reviews_updated_at" BEFORE UPDATE ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "services_updated_at" BEFORE UPDATE ON "public"."services" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "touch_conversation_on_message_insert" AFTER INSERT ON "public"."messages" FOR EACH ROW EXECUTE FUNCTION "private"."touch_conversation_from_message"();



CREATE OR REPLACE TRIGGER "validate_website_featured_review" BEFORE INSERT OR UPDATE ON "public"."website_featured_reviews" FOR EACH ROW EXECUTE FUNCTION "private"."validate_featured_review"();



CREATE OR REPLACE TRIGGER "website_content_updated_at" BEFORE UPDATE ON "public"."website_content" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "website_settings_updated_at" BEFORE UPDATE ON "public"."website_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."availability_exceptions"
    ADD CONSTRAINT "availability_exceptions_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."availability_rules"
    ADD CONSTRAINT "availability_rules_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_client_same_photographer_fk" FOREIGN KEY ("photographer_id", "client_id") REFERENCES "public"."clients"("photographer_id", "client_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_service_same_photographer_fk" FOREIGN KEY ("photographer_id", "service_id") REFERENCES "public"."services"("photographer_id", "service_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."calendar_integrations"
    ADD CONSTRAINT "calendar_integrations_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."clients"
    ADD CONSTRAINT "clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."conversations"
    ADD CONSTRAINT "conversations_client_ownership_fk" FOREIGN KEY ("photographer_id", "client_id") REFERENCES "public"."clients"("photographer_id", "client_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."galleries"
    ADD CONSTRAINT "galleries_booking_ownership_fk" FOREIGN KEY ("photographer_id", "client_id", "booking_id") REFERENCES "public"."bookings"("photographer_id", "client_id", "booking_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_invoice_ownership_fk" FOREIGN KEY ("photographer_id", "invoice_id") REFERENCES "public"."invoices"("photographer_id", "invoice_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."invoice_items"
    ADD CONSTRAINT "invoice_items_service_ownership_fk" FOREIGN KEY ("photographer_id", "service_id") REFERENCES "public"."services"("photographer_id", "service_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_booking_ownership_fk" FOREIGN KEY ("photographer_id", "client_id", "booking_id") REFERENCES "public"."bookings"("photographer_id", "client_id", "booking_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."media_favourites"
    ADD CONSTRAINT "media_favourites_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("client_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media_favourites"
    ADD CONSTRAINT "media_favourites_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "public"."media"("media_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."media"
    ADD CONSTRAINT "media_gallery_ownership_fk" FOREIGN KEY ("photographer_id", "gallery_id") REFERENCES "public"."galleries"("photographer_id", "gallery_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("conversation_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("user_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("invoice_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."photographer_payment_settings"
    ADD CONSTRAINT "photographer_payment_settings_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_profiles"
    ADD CONSTRAINT "photographer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("user_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."photographer_stripe_accounts"
    ADD CONSTRAINT "photographer_stripe_accounts_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."portfolio_items"
    ADD CONSTRAINT "portfolio_items_source_media_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media"("media_id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_booking_ownership_fk" FOREIGN KEY ("photographer_id", "client_id", "booking_id") REFERENCES "public"."bookings"("photographer_id", "client_id", "booking_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."website_content"
    ADD CONSTRAINT "website_content_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."website_featured_reviews"
    ADD CONSTRAINT "website_featured_reviews_photographer_fk" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."website_featured_reviews"
    ADD CONSTRAINT "website_featured_reviews_review_fk" FOREIGN KEY ("photographer_id", "review_id") REFERENCES "public"."reviews"("photographer_id", "review_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."website_settings"
    ADD CONSTRAINT "website_settings_photographer_id_fkey" FOREIGN KEY ("photographer_id") REFERENCES "public"."photographer_profiles"("photographer_id") ON DELETE CASCADE;



CREATE POLICY "Approved reviews of published photographers are public" ON "public"."reviews" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'approved'::"public"."review_status") AND (EXISTS ( SELECT 1
   FROM "public"."photographer_profiles" "p"
  WHERE (("p"."photographer_id" = "reviews"."photographer_id") AND ("p"."published" = true))))));



CREATE POLICY "Clients can add favourites" ON "public"."media_favourites" FOR INSERT TO "authenticated" WITH CHECK (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can create conversations" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can create reviews" ON "public"."reviews" FOR INSERT TO "authenticated" WITH CHECK ((("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")) AND ("status" = 'pending'::"public"."review_status") AND (EXISTS ( SELECT 1
   FROM "public"."bookings" "b"
  WHERE (("b"."booking_id" = "reviews"."booking_id") AND ("b"."client_id" = "reviews"."client_id") AND ("b"."photographer_id" = "reviews"."photographer_id") AND ("b"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")) AND ("b"."status" = 'completed'::"public"."booking_status"))))));



CREATE POLICY "Clients can create their own bookings" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can create their own client record" ON "public"."clients" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Clients can remove favourites" ON "public"."media_favourites" FOR DELETE TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can update their own bookings" ON "public"."bookings" FOR UPDATE TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id"))) WITH CHECK (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can update their own record" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Clients can view media in paid published galleries" ON "public"."media" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."galleries" "g"
  WHERE (("g"."gallery_id" = "media"."gallery_id") AND ("g"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")) AND ("g"."is_published" = true) AND (EXISTS ( SELECT 1
           FROM "public"."invoices" "i"
          WHERE (("i"."booking_id" = "g"."booking_id") AND ("i"."client_id" = "g"."client_id") AND ("i"."status" = 'paid'::"public"."invoice_status")))) AND (EXISTS ( SELECT 1
           FROM ("public"."payments" "p"
             JOIN "public"."invoices" "i" ON (("i"."invoice_id" = "p"."invoice_id")))
          WHERE (("i"."booking_id" = "g"."booking_id") AND ("p"."status" = 'successful'::"public"."payment_status"))))))));



CREATE POLICY "Clients can view paid published galleries" ON "public"."galleries" FOR SELECT TO "authenticated" USING ((("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")) AND ("is_published" = true) AND (EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."booking_id" = "galleries"."booking_id") AND ("i"."client_id" = "galleries"."client_id") AND ("i"."status" = 'paid'::"public"."invoice_status")))) AND (EXISTS ( SELECT 1
   FROM ("public"."payments" "p"
     JOIN "public"."invoices" "i" ON (("i"."invoice_id" = "p"."invoice_id")))
  WHERE (("i"."booking_id" = "galleries"."booking_id") AND ("p"."status" = 'successful'::"public"."payment_status"))))));



CREATE POLICY "Clients can view their bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can view their conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can view their favourites" ON "public"."media_favourites" FOR SELECT TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can view their invoice items" ON "public"."invoice_items" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."invoice_id" = "invoice_items"."invoice_id") AND ("i"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id"))))));



CREATE POLICY "Clients can view their invoices" ON "public"."invoices" FOR SELECT TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can view their own client record" ON "public"."clients" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Clients can view their own reviews" ON "public"."reviews" FOR SELECT TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can view their payments" ON "public"."payments" FOR SELECT TO "authenticated" USING (("client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")));



CREATE POLICY "Clients can view their photographer availability exceptions" ON "public"."availability_exceptions" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "c"."photographer_id"
   FROM "public"."clients" "c"
  WHERE ("c"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id"))
 LIMIT 1)));



CREATE POLICY "Clients can view their photographer availability rules" ON "public"."availability_rules" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "c"."photographer_id"
   FROM "public"."clients" "c"
  WHERE ("c"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id"))
 LIMIT 1)));



CREATE POLICY "Clients can view their photographer profile" ON "public"."photographer_profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."photographer_id" = "photographer_profiles"."photographer_id") AND ("c"."user_id" = "auth"."uid"())))));



CREATE POLICY "Clients can view their photographers services" ON "public"."services" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "c"."photographer_id"
   FROM "public"."clients" "c"
  WHERE ("c"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id"))
 LIMIT 1)));



CREATE POLICY "Conversation participants can send messages" ON "public"."messages" FOR INSERT TO "authenticated" WITH CHECK ((("sender_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "messages"."conversation_id") AND (("c"."photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")) OR ("c"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id"))))))));



CREATE POLICY "Conversation participants can view messages" ON "public"."messages" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "messages"."conversation_id") AND (("c"."photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")) OR ("c"."client_id" = ( SELECT "private"."current_client_id"() AS "current_client_id")))))));



CREATE POLICY "Photographers can add their featured reviews" ON "public"."website_featured_reviews" FOR INSERT TO "authenticated" WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can create bookings" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can create conversations" ON "public"."conversations" FOR INSERT TO "authenticated" WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can create their calendar integration" ON "public"."calendar_integrations" FOR INSERT TO "authenticated" WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can create their own profile" ON "public"."photographer_profiles" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_photographer"() AS "is_photographer")));



CREATE POLICY "Photographers can delete bookings" ON "public"."bookings" FOR DELETE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can delete their calendar integration" ON "public"."calendar_integrations" FOR DELETE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can delete their clients" ON "public"."clients" FOR DELETE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can delete their own profile" ON "public"."photographer_profiles" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Photographers can remove their featured reviews" ON "public"."website_featured_reviews" FOR DELETE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can update bookings" ON "public"."bookings" FOR UPDATE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can update their calendar integration" ON "public"."calendar_integrations" FOR UPDATE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can update their client profiles" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."photographer_profiles" "pp" ON (("pp"."photographer_id" = "c"."photographer_id")))
  WHERE (("c"."user_id" = "profiles"."user_id") AND ("pp"."user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."photographer_profiles" "pp" ON (("pp"."photographer_id" = "c"."photographer_id")))
  WHERE (("c"."user_id" = "profiles"."user_id") AND ("pp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Photographers can update their clients" ON "public"."clients" FOR UPDATE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can update their featured reviews" ON "public"."website_featured_reviews" FOR UPDATE TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can update their own profile" ON "public"."photographer_profiles" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Photographers can view client favourites" ON "public"."media_favourites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clients" "c"
  WHERE (("c"."client_id" = "media_favourites"."client_id") AND ("c"."photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))))));



CREATE POLICY "Photographers can view own Stripe account" ON "public"."photographer_stripe_accounts" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can view their bookings" ON "public"."bookings" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can view their calendar integration" ON "public"."calendar_integrations" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can view their client profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."clients" "c"
     JOIN "public"."photographer_profiles" "pp" ON (("pp"."photographer_id" = "c"."photographer_id")))
  WHERE (("c"."user_id" = "profiles"."user_id") AND ("pp"."user_id" = "auth"."uid"())))));



CREATE POLICY "Photographers can view their clients" ON "public"."clients" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can view their conversations" ON "public"."conversations" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can view their featured reviews" ON "public"."website_featured_reviews" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers can view their own profile" ON "public"."photographer_profiles" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Photographers can view their payments" ON "public"."payments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."invoices" "i"
  WHERE (("i"."invoice_id" = "payments"."invoice_id") AND ("i"."photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))))));



CREATE POLICY "Photographers can view their reviews" ON "public"."reviews" FOR SELECT TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage availability exceptions" ON "public"."availability_exceptions" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage availability rules" ON "public"."availability_rules" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their galleries" ON "public"."galleries" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their invoice items" ON "public"."invoice_items" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their invoices" ON "public"."invoices" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their media" ON "public"."media" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their payment settings" ON "public"."photographer_payment_settings" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their portfolio" ON "public"."portfolio_items" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their services" ON "public"."services" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their website content" ON "public"."website_content" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Photographers manage their website settings" ON "public"."website_settings" TO "authenticated" USING (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id"))) WITH CHECK (("photographer_id" = ( SELECT "private"."current_photographer_id"() AS "current_photographer_id")));



CREATE POLICY "Public can view active published services" ON "public"."services" FOR SELECT TO "anon" USING ((("is_active" = true) AND (EXISTS ( SELECT 1
   FROM "public"."photographer_profiles" "p"
  WHERE (("p"."photographer_id" = "services"."photographer_id") AND ("p"."published" = true))))));



CREATE POLICY "Published featured reviews are public" ON "public"."website_featured_reviews" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM ("public"."photographer_profiles" "p"
     JOIN "public"."reviews" "r" ON (("r"."photographer_id" = "p"."photographer_id")))
  WHERE (("p"."photographer_id" = "website_featured_reviews"."photographer_id") AND ("r"."review_id" = "website_featured_reviews"."review_id") AND ("r"."photographer_id" = "website_featured_reviews"."photographer_id") AND ("p"."published" = true) AND ("r"."status" = 'approved'::"public"."review_status")))));



CREATE POLICY "Published photographer profiles are public" ON "public"."photographer_profiles" FOR SELECT TO "authenticated", "anon" USING (("published" = true));



CREATE POLICY "Published portfolio items are public" ON "public"."portfolio_items" FOR SELECT TO "authenticated", "anon" USING ((("published" = true) AND (EXISTS ( SELECT 1
   FROM "public"."photographer_profiles" "p"
  WHERE (("p"."photographer_id" = "portfolio_items"."photographer_id") AND ("p"."published" = true))))));



CREATE POLICY "Published website content is public" ON "public"."website_content" FOR SELECT TO "authenticated", "anon" USING ((("published" = true) AND (EXISTS ( SELECT 1
   FROM "public"."photographer_profiles" "p"
  WHERE (("p"."photographer_id" = "website_content"."photographer_id") AND ("p"."published" = true))))));



CREATE POLICY "Published website settings are public" ON "public"."website_settings" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."photographer_profiles" "p"
  WHERE (("p"."photographer_id" = "website_settings"."photographer_id") AND ("p"."published" = true)))));



CREATE POLICY "Recipients can mark messages read" ON "public"."messages" FOR UPDATE TO "authenticated" USING ((("sender_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "messages"."conversation_id") AND (("c"."photographer_id" = "private"."current_photographer_id"()) OR ("c"."client_id" = "private"."current_client_id"()))))))) WITH CHECK ((("sender_id" <> "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."conversations" "c"
  WHERE (("c"."conversation_id" = "messages"."conversation_id") AND (("c"."photographer_id" = "private"."current_photographer_id"()) OR ("c"."client_id" = "private"."current_client_id"())))))));



CREATE POLICY "Users can create their own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their notifications" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their notifications" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."availability_exceptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."availability_rules" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."calendar_integrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."clients" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."galleries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoice_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."media_favourites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photographer_payment_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photographer_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."photographer_stripe_accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."portfolio_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."website_content" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."website_featured_reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."website_settings" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "private"."current_client_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_client_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."current_photographer_id"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."current_photographer_id"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_client"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_client"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_photographer"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_photographer"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."owns_client"("requested_client_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."owns_client"("requested_client_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."owns_photographer"("requested_photographer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."owns_photographer"("requested_photographer_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_booking_busy_times"("p_photographer_id" "uuid", "p_date" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_booking_busy_times"("p_photographer_id" "uuid", "p_date" "date") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_featured_reviews"("p_photographer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_featured_reviews"("p_photographer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_featured_reviews"("p_photographer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_featured_reviews"("p_photographer_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_reviews"("p_photographer_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_reviews"("p_photographer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_reviews"("p_photographer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_reviews"("p_photographer_id" "uuid") TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."reviews" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_review"("p_review_id" "uuid", "p_status" "public"."review_status") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_review"("p_review_id" "uuid", "p_status" "public"."review_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."moderate_review"("p_review_id" "uuid", "p_status" "public"."review_status") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_pending_review"("p_review_id" "uuid", "p_rating" smallint, "p_comment" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_pending_review"("p_review_id" "uuid", "p_rating" smallint, "p_comment" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_pending_review"("p_review_id" "uuid", "p_rating" smallint, "p_comment" "text") TO "service_role";



GRANT MAINTAIN ON TABLE "public"."availability_exceptions" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."availability_exceptions" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_exceptions" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."availability_rules" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."availability_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."availability_rules" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."bookings" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."calendar_integrations" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."calendar_integrations" TO "authenticated";
GRANT ALL ON TABLE "public"."calendar_integrations" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."clients" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."clients" TO "authenticated";
GRANT ALL ON TABLE "public"."clients" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."conversations" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."conversations" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."galleries" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."galleries" TO "authenticated";
GRANT ALL ON TABLE "public"."galleries" TO "service_role";



GRANT ALL ON TABLE "public"."invoice_items" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."invoice_items" TO "authenticated";



GRANT ALL ON TABLE "public"."invoices" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."invoices" TO "authenticated";



GRANT MAINTAIN ON TABLE "public"."media" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."media" TO "authenticated";
GRANT ALL ON TABLE "public"."media" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."media_favourites" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."media_favourites" TO "authenticated";
GRANT ALL ON TABLE "public"."media_favourites" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."messages" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."notifications" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."photographer_payment_settings" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."photographer_payment_settings" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."photographer_profiles" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."photographer_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_profiles" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."photographer_stripe_accounts" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."photographer_stripe_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."photographer_stripe_accounts" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."portfolio_items" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."portfolio_items" TO "authenticated";
GRANT ALL ON TABLE "public"."portfolio_items" TO "service_role";



GRANT MAINTAIN ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";
GRANT SELECT ON TABLE "public"."services" TO "anon";



GRANT SELECT,MAINTAIN ON TABLE "public"."website_content" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."website_content" TO "authenticated";
GRANT ALL ON TABLE "public"."website_content" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."website_featured_reviews" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."website_featured_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."website_featured_reviews" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."website_settings" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."website_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."website_settings" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";







