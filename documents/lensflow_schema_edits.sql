-- ============================================================================
-- LensFlow V1 - Edits to Supabase Database Recovery / Migration Schema
-- ============================================================================

-- ============================================================================
-- Add Policy for Photographers to upload media to their website
-- ===========================================================================

CREATE POLICY "Photographers can upload website media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'photographer-website-media'

  AND array_length(
    storage.foldername(storage.objects.name),
    1
  ) >= 2

  AND (
    storage.foldername(storage.objects.name)
  )[2] IN ('hero', 'about')

  AND EXISTS (
    SELECT 1
    FROM public.photographer_profiles pp
    WHERE pp.photographer_id =
      (
        (
          storage.foldername(
            storage.objects.name
          )
        )[1]
      )::uuid
      AND pp.user_id = auth.uid()
  )
);

-- ============================================================================
-- Add Policy for Photographers to update media on their website
-- ===========================================================================

CREATE POLICY "Photographers can update website media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'photographer-website-media'

  AND array_length(
    storage.foldername(storage.objects.name),
    1
  ) >= 2

  AND (
    storage.foldername(storage.objects.name)
  )[2] IN ('hero', 'about')

  AND EXISTS (
    SELECT 1
    FROM public.photographer_profiles pp
    WHERE pp.photographer_id =
      (
        (
          storage.foldername(
            storage.objects.name
          )
        )[1]
      )::uuid
      AND pp.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'photographer-website-media'

  AND array_length(
    storage.foldername(storage.objects.name),
    1
  ) >= 2

  AND (
    storage.foldername(storage.objects.name)
  )[2] IN ('hero', 'about')

  AND EXISTS (
    SELECT 1
    FROM public.photographer_profiles pp
    WHERE pp.photographer_id =
      (
        (
          storage.foldername(
            storage.objects.name
          )
        )[1]
      )::uuid
      AND pp.user_id = auth.uid()
  )
);

-- ===========================================================================
-- Add Policy for Photographers to delete media from their website
-- ===========================================================================

CREATE POLICY "Photographers can delete website media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'photographer-website-media'

  AND array_length(
    storage.foldername(storage.objects.name),
    1
  ) >= 2

  AND (
    storage.foldername(storage.objects.name)
  )[2] IN ('hero', 'about')

  AND EXISTS (
    SELECT 1
    FROM public.photographer_profiles pp
    WHERE pp.photographer_id =
      (
        (
          storage.foldername(
            storage.objects.name
          )
        )[1]
      )::uuid
      AND pp.user_id = auth.uid()
  )
);

-- ===========================================================================
-- Add Policy for Photographers to view media on their website
-- ===========================================================================

CREATE POLICY "Photographers can view their website media"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'photographer-website-media'

  AND array_length(
    storage.foldername(storage.objects.name),
    1
  ) >= 2

  AND (
    storage.foldername(storage.objects.name)
  )[2] IN ('hero', 'about')

  AND EXISTS (
    SELECT 1
    FROM public.photographer_profiles pp
    WHERE pp.photographer_id =
      (
        (
          storage.foldername(
            storage.objects.name
          )
        )[1]
      )::uuid
      AND pp.user_id = auth.uid()
  )
);


-- ===========================================================================
-- Update website settings table to include font options for heading, body, 
-- and navigation
-- ===========================================================================

ALTER TABLE public.website_settings
ADD COLUMN heading_font varchar(100),
ADD COLUMN body_font varchar(100),
ADD COLUMN navigation_font varchar(100);

-- ===========================================================================
-- Update existing records to set heading_font, body_font, and navigation_font 
-- to font_family if they are NULL
-- ===========================================================================

UPDATE public.website_settings
SET
    heading_font = COALESCE(heading_font, font_family),
    body_font = COALESCE(body_font, font_family),
    navigation_font = COALESCE(navigation_font, font_family)
WHERE font_family IS NOT NULL;




-- =========================================================
-- LENSFLOW MESSAGING V1 SECURITY + REALTIME MIGRATION
-- =========================================================


-- =========================================================
-- 1. REMOVE MESSAGE EDIT / DELETE POLICIES
-- =========================================================

DROP POLICY IF EXISTS
"Users can update their own messages"
ON public.messages;

DROP POLICY IF EXISTS
"Users can delete their own messages"
ON public.messages;


-- =========================================================
-- 2. REMOVE DIRECT CONVERSATION UPDATE
-- =========================================================
--
-- There currently aren't any user-editable conversation
-- fields. updated_at will be maintained automatically.
--

DROP POLICY IF EXISTS
"Photographers can update conversations"
ON public.conversations;


-- =========================================================
-- 3. ALLOW RECIPIENT TO UPDATE MESSAGE READ STATE
-- =========================================================

CREATE POLICY
"Recipients can mark messages read"
ON public.messages
FOR UPDATE
TO authenticated
USING (
    sender_id <> auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.conversation_id =
              messages.conversation_id
        AND (
            c.photographer_id =
                private.current_photographer_id()
            OR
            c.client_id =
                private.current_client_id()
        )
    )
)
WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.conversation_id =
              messages.conversation_id
        AND (
            c.photographer_id =
                private.current_photographer_id()
            OR
            c.client_id =
                private.current_client_id()
        )
    )
);


-- =========================================================
-- 4. PREVENT MESSAGE CONTENT FROM BEING MODIFIED
-- =========================================================
--
-- Even though the recipient has UPDATE permission,
-- they should only be able to change is_read.
--

CREATE OR REPLACE FUNCTION private.protect_message_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
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


DROP TRIGGER IF EXISTS
protect_message_update_trigger
ON public.messages;

CREATE TRIGGER
protect_message_update_trigger
BEFORE UPDATE
ON public.messages
FOR EACH ROW
EXECUTE FUNCTION
private.protect_message_update();


-- =========================================================
-- 5. UPDATE CONVERSATION TIMESTAMP WHEN MESSAGE IS SENT
-- =========================================================
--
-- This lets the inbox order conversations by most
-- recently active conversation.
--

CREATE OR REPLACE FUNCTION private.touch_conversation_from_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN

    UPDATE public.conversations
    SET updated_at = NEW.created_at
    WHERE conversation_id =
          NEW.conversation_id;

    RETURN NEW;

END;
$$;


DROP TRIGGER IF EXISTS
touch_conversation_on_message_insert
ON public.messages;

CREATE TRIGGER
touch_conversation_on_message_insert
AFTER INSERT
ON public.messages
FOR EACH ROW
EXECUTE FUNCTION
private.touch_conversation_from_message();


-- =========================================================
-- 6. INDEX UNREAD MESSAGES
-- =========================================================

CREATE INDEX IF NOT EXISTS
idx_messages_unread
ON public.messages (
    conversation_id,
    sender_id,
    created_at DESC
)
WHERE is_read = false;


-- =========================================================
-- 7. ENABLE REALTIME FOR MESSAGES
-- =========================================================

ALTER PUBLICATION supabase_realtime
ADD TABLE public.messages;

-- =========================================================
-- 8. CLIENTS CAN VIEW THEIR ASSIGNED PHOTOGRAPHER
-- =========================================================

DROP POLICY IF EXISTS
"Clients can view their photographer profile"
ON public.photographer_profiles;


CREATE POLICY
"Clients can view their photographer profile"
ON public.photographer_profiles
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE
            c.photographer_id =
                photographer_profiles.photographer_id
        AND c.user_id = auth.uid()
    )
);

-- =========================================================
-- 9. CLIENTS CAN VIEW THEIR PHOTOGRAPHER AVAILABILITY RULES
-- =========================================================

CREATE POLICY "Clients can view their photographer availability rules"
ON public.availability_rules
FOR SELECT
TO authenticated
USING (
    photographer_id = (
        SELECT c.photographer_id
        FROM public.clients c
        WHERE c.client_id = (
            SELECT private.current_client_id()
        )
        LIMIT 1
    )
);

-- =========================================================
-- 10. CLIENTS CAN VIEW THEIR PHOTOGRAPHER AVAILABILITY EXCEPTIONS  
-- =========================================================


CREATE POLICY "Clients can view their photographer availability exceptions"
ON public.availability_exceptions
FOR SELECT
TO authenticated
USING (
    photographer_id = (
        SELECT c.photographer_id
        FROM public.clients c
        WHERE c.client_id = (
            SELECT private.current_client_id()
        )
        LIMIT 1
    )
);


-- =========================================================
-- 11. FUNCTION TO MODERATE REVIEWS
-- - photographers can only approve or reject reviews for their own bookings
-- - changing the rating or review text is not allowed
-- =========================================================

CREATE OR REPLACE FUNCTION public.moderate_review(
    p_review_id uuid,
    p_status public.review_status
)
RETURNS public.reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

-- =========================================================
-- 12. REVOKE PUBLIC EXECUTE ON FUNCTION public.moderate_review
-- =========================================================

REVOKE ALL ON FUNCTION public.moderate_review(
    uuid,
    public.review_status
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.moderate_review(
    uuid,
    public.review_status
) TO authenticated;

-- =========================================================
-- 13. DROP OLD POLICY FOR PHOTOGRAPHERS TO MODERATE AND DELETE THEIR REVIEWS
-- =========================================================

DROP POLICY IF EXISTS
"Photographers can moderate their reviews"
ON public.reviews;

DROP POLICY IF EXISTS
"Photographers can delete their reviews"
ON public.reviews;


-- =========================================================
-- 14. FUNCTION TO GET PUBLIC REVIEWS FOR A PHOTOGRAPHER
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_public_reviews(
    p_photographer_id uuid
)
RETURNS TABLE (
    review_id uuid,
    photographer_id uuid,
    rating smallint,
    comment text,
    created_at timestamptz,
    display_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        r.review_id,
        r.photographer_id,
        r.rating,
        r.comment,
        r.created_at,

        CASE
            WHEN NULLIF(TRIM(p.first_name), '') IS NULL
                THEN 'Photography Client'

            WHEN NULLIF(TRIM(p.last_name), '') IS NULL
                THEN TRIM(p.first_name)

            ELSE
                TRIM(p.first_name)
                || ' '
                || UPPER(LEFT(TRIM(p.last_name), 1))
                || '.'
        END AS display_name

    FROM public.reviews r

    JOIN public.clients c
        ON c.client_id = r.client_id

    JOIN public.profiles p
        ON p.user_id = c.user_id

    WHERE r.photographer_id = p_photographer_id
      AND r.status = 'approved'::public.review_status

    ORDER BY r.created_at DESC;
$$;


-- =========================================================
-- 15. REVOKE PUBLIC EXECUTE ON FUNCTION public.get_public_reviews
-- =========================================================

REVOKE ALL ON FUNCTION public.get_public_reviews(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_public_reviews(uuid)
TO anon, authenticated;


-- =========================================================
-- 16. ADD UNIQUE CONSTRAINT TO ENSURE A CLIENT CAN ONLY REVIEW A PHOTOGRAPHER ONCE PER BOOKING
-- =========================================================

ALTER TABLE public.reviews
ADD CONSTRAINT reviews_photographer_review_unique
UNIQUE (photographer_id, review_id);


-- =========================================================
-- 17. CREATE TABLE FOR FEATURED REVIEWS ON PHOTOGRAPHER WEBSITE
-- =========================================================

CREATE TABLE public.website_featured_reviews (
    photographer_id uuid NOT NULL,
    review_id uuid NOT NULL,
    display_order smallint NOT NULL,

    CONSTRAINT website_featured_reviews_pkey
        PRIMARY KEY (photographer_id, review_id),

    CONSTRAINT website_featured_reviews_photographer_fk
        FOREIGN KEY (photographer_id)
        REFERENCES public.photographer_profiles(photographer_id)
        ON DELETE CASCADE,

    CONSTRAINT website_featured_reviews_review_fk
        FOREIGN KEY (photographer_id, review_id)
        REFERENCES public.reviews(photographer_id, review_id)
        ON DELETE CASCADE,

    CONSTRAINT website_featured_reviews_order_check
        CHECK (display_order BETWEEN 1 AND 3),

    CONSTRAINT website_featured_reviews_order_unique
        UNIQUE (photographer_id, display_order)
);


-- =========================================================
-- 18. ENABLE ROW LEVEL SECURITY ON FEATURED REVIEWS TABLE
-- =========================================================

ALTER TABLE public.website_featured_reviews
ENABLE ROW LEVEL SECURITY;


-- =========================================================
-- 19. CREATE POLICIES FOR PHOTOGRAPHERS TO MANAGE THEIR FEATURED REVIEWS
-- =========================================================

CREATE POLICY "Photographers can view their featured reviews"
ON public.website_featured_reviews
FOR SELECT
TO authenticated
USING (
    photographer_id =
    (SELECT private.current_photographer_id())
);

CREATE POLICY "Photographers can add their featured reviews"
ON public.website_featured_reviews
FOR INSERT
TO authenticated
WITH CHECK (
    photographer_id =
    (SELECT private.current_photographer_id())
);

CREATE POLICY "Photographers can update their featured reviews"
ON public.website_featured_reviews
FOR UPDATE
TO authenticated
USING (
    photographer_id =
    (SELECT private.current_photographer_id())
)
WITH CHECK (
    photographer_id =
    (SELECT private.current_photographer_id())
);

CREATE POLICY "Photographers can remove their featured reviews"
ON public.website_featured_reviews
FOR DELETE
TO authenticated
USING (
    photographer_id =
    (SELECT private.current_photographer_id())
);


-- =========================================================
-- 20. CREATE FUNCTION TO VALIDATE FEATURED REVIEWS
-- =========================================================

CREATE OR REPLACE FUNCTION private.validate_featured_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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


-- =========================================================
-- 21. CREATE TRIGGER TO VALIDATE FEATURED REVIEWS
-- =========================================================

CREATE TRIGGER validate_website_featured_review
BEFORE INSERT OR UPDATE
ON public.website_featured_reviews
FOR EACH ROW
EXECUTE FUNCTION private.validate_featured_review();


-- =========================================================
-- 22. CREATE FUNCTION TO REMOVE UNPUBLISHED FEATURED REVIEWS
-- =========================================================

CREATE OR REPLACE FUNCTION private.remove_unpublished_featured_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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


-- =========================================================
-- 23. CREATE TRIGGER TO REMOVE UNPUBLISHED FEATURED REVIEWS
-- =========================================================

CREATE TRIGGER remove_unpublished_featured_review
AFTER UPDATE OF status
ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION private.remove_unpublished_featured_review();


-- =========================================================
-- 24. CREATE FUNCTION TO GET FEATURED REVIEWS FOR A PHOTOGRAPHER
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_featured_reviews(
    p_photographer_id uuid
)
RETURNS TABLE (
    review_id uuid,
    photographer_id uuid,
    rating smallint,
    comment text,
    created_at timestamptz,
    display_name text,
    display_order smallint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        r.review_id,
        r.photographer_id,
        r.rating,
        r.comment,
        r.created_at,

        CASE
            WHEN NULLIF(TRIM(p.first_name), '') IS NULL
                THEN 'Photography Client'

            WHEN NULLIF(TRIM(p.last_name), '') IS NULL
                THEN TRIM(p.first_name)

            ELSE
                TRIM(p.first_name)
                || ' '
                || UPPER(LEFT(TRIM(p.last_name), 1))
                || '.'
        END AS display_name,

        f.display_order

    FROM public.website_featured_reviews f

    JOIN public.reviews r
        ON r.review_id = f.review_id
       AND r.photographer_id = f.photographer_id

    JOIN public.clients c
        ON c.client_id = r.client_id

    JOIN public.profiles p
        ON p.user_id = c.user_id

    WHERE f.photographer_id = p_photographer_id
      AND r.status = 'approved'::public.review_status

    ORDER BY f.display_order ASC

    LIMIT 3;
$$;


-- =========================================================
-- 25. REVOKE PUBLIC EXECUTE ON FUNCTION public.get_featured_reviews
-- =========================================================

REVOKE ALL ON FUNCTION public.get_featured_reviews(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_featured_reviews(uuid)
TO anon, authenticated;


-- =========================================================
-- 26. UPDATE POLICY FOR CLIENTS TO CREATE REVIEWS
-- =========================================================

DROP POLICY IF EXISTS
"Clients can create reviews"
ON public.reviews;

CREATE POLICY
"Clients can create reviews"
ON public.reviews
FOR INSERT
TO authenticated
WITH CHECK (
    client_id = (SELECT private.current_client_id())

    AND status = 'pending'::public.review_status

    AND EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.booking_id = reviews.booking_id
          AND b.client_id = reviews.client_id
          AND b.photographer_id = reviews.photographer_id
          AND b.client_id = (SELECT private.current_client_id())
          AND b.status = 'completed'::public.booking_status
    )
);


-- =========================================================
-- 27. CREATE FUNCTION FOR CLIENTS TO UPDATE THEIR PENDING REVIEWS
-- =========================================================

CREATE OR REPLACE FUNCTION public.update_pending_review(
    p_review_id uuid,
    p_rating smallint,
    p_comment text
)
RETURNS public.reviews
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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

REVOKE ALL
ON FUNCTION public.update_pending_review(uuid, smallint, text)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.update_pending_review(uuid, smallint, text)
FROM anon;

GRANT EXECUTE
ON FUNCTION public.update_pending_review(uuid, smallint, text)
TO authenticated;


-- =========================================================
-- 28. DROP OLD POLICY FOR CLIENTS TO UPDATE THEIR REVIEWS
-- =========================================================

DROP POLICY IF EXISTS
"Clients can update their own reviews"
ON public.reviews;


-- ========================================================
-- 29. ALTER INVOICE_ITEMS TABLE TO ALLOW NULL SERVICE_ID
-- ========================================================

alter table public.invoice_items
alter column service_id drop not null;


-- ========================================================
-- 30. ADD PHOTOGRAPHER TAX SETTINGS AND INVOICE SNAPSHOT
-- ========================================================

ALTER TABLE public.photographer_profiles
ADD COLUMN IF NOT EXISTS gst_tax_number varchar(100),
ADD COLUMN IF NOT EXISTS default_tax_rate numeric(5,2) NOT NULL DEFAULT 15.00;

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS tax_number varchar(100);

UPDATE public.invoices AS invoice
SET tax_number = profile.gst_tax_number
FROM public.photographer_profiles AS profile
WHERE invoice.photographer_id = profile.photographer_id
  AND invoice.tax_number IS NULL
  AND profile.gst_tax_number IS NOT NULL;


-- ========================================================
-- 31. ADD BANK DETAILS AND INVOICE SNAPSHOT
-- ========================================================

CREATE TABLE IF NOT EXISTS public.photographer_payment_settings (
    photographer_id uuid PRIMARY KEY
        REFERENCES public.photographer_profiles(photographer_id)
        ON DELETE CASCADE,
    bank_account_name varchar(150),
    bank_name varchar(150),
    bank_account_number varchar(100),
    bank_payment_instructions text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.photographer_payment_settings
ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.photographer_payment_settings
TO authenticated, service_role;

DROP POLICY IF EXISTS
"Photographers manage their payment settings"
ON public.photographer_payment_settings;

CREATE POLICY "Photographers manage their payment settings"
ON public.photographer_payment_settings
FOR ALL TO authenticated
USING (
    photographer_id = (
        SELECT private.current_photographer_id()
    )
)
WITH CHECK (
    photographer_id = (
        SELECT private.current_photographer_id()
    )
);

DROP TRIGGER IF EXISTS
photographer_payment_settings_updated_at
ON public.photographer_payment_settings;

CREATE TRIGGER photographer_payment_settings_updated_at
BEFORE UPDATE ON public.photographer_payment_settings
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS bank_account_name varchar(150),
ADD COLUMN IF NOT EXISTS bank_name varchar(150),
ADD COLUMN IF NOT EXISTS bank_account_number varchar(100),
ADD COLUMN IF NOT EXISTS bank_payment_instructions text;

UPDATE public.invoices AS invoice
SET bank_account_name = settings.bank_account_name,
    bank_name = settings.bank_name,
    bank_account_number = settings.bank_account_number,
    bank_payment_instructions = settings.bank_payment_instructions
FROM public.photographer_payment_settings AS settings
WHERE invoice.photographer_id = settings.photographer_id
  AND invoice.bank_account_name IS NULL
  AND invoice.bank_account_number IS NULL;

REVOKE ALL
ON public.photographer_payment_settings
FROM anon;

REVOKE ALL
ON public.photographer_payment_settings
FROM authenticated;

GRANT SELECT, INSERT, UPDATE
ON public.photographer_payment_settings
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.photographer_payment_settings
TO service_role;

-- ========================================================
-- 32. ADD CHECK CONSTRAINT FOR PHOTOGRAPHER TAX RATE
-- ========================================================

ALTER TABLE public.photographer_profiles
ADD CONSTRAINT photographer_profiles_default_tax_rate_check
CHECK (
    default_tax_rate >= 0
    AND default_tax_rate <= 100
);

-- ========================================================
-- 33. ADD CHECK CONSTRAINT FOR PHOTOGRAPHER GST TAX NUMBER
-- ========================================================

ALTER TABLE public.photographer_profiles
ADD CONSTRAINT photographer_profiles_gst_tax_number_not_blank
CHECK (
    gst_tax_number IS NULL
    OR length(trim(gst_tax_number)) > 0
);


-- ========================================================
-- 34. MOVE TAX SETTINGS INTO PRIVATE PAYMENT SETTINGS
-- ========================================================

ALTER TABLE public.photographer_payment_settings
ADD COLUMN IF NOT EXISTS gst_tax_number varchar(100),
ADD COLUMN IF NOT EXISTS default_tax_rate numeric(5,2)
    NOT NULL DEFAULT 15.00;


-- Copy existing photographer tax settings across
UPDATE public.photographer_payment_settings AS settings
SET
    gst_tax_number = profile.gst_tax_number,
    default_tax_rate = profile.default_tax_rate
FROM public.photographer_profiles AS profile
WHERE settings.photographer_id = profile.photographer_id;


-- Create payment settings rows where one does not exist yet
INSERT INTO public.photographer_payment_settings (
    photographer_id,
    gst_tax_number,
    default_tax_rate
)
SELECT
    profile.photographer_id,
    profile.gst_tax_number,
    profile.default_tax_rate
FROM public.photographer_profiles AS profile
WHERE NOT EXISTS (
    SELECT 1
    FROM public.photographer_payment_settings AS settings
    WHERE settings.photographer_id = profile.photographer_id
);


-- Validate tax percentage at database level
ALTER TABLE public.photographer_payment_settings
ADD CONSTRAINT photographer_payment_settings_tax_rate_check
CHECK (
    default_tax_rate >= 0
    AND default_tax_rate <= 100
);


-- Prevent blank GST numbers
ALTER TABLE public.photographer_payment_settings
ADD CONSTRAINT photographer_payment_settings_gst_number_not_blank
CHECK (
    gst_tax_number IS NULL
    OR length(trim(gst_tax_number)) > 0
);


-- Remove financial settings from the partly-public profile table
ALTER TABLE public.photographer_profiles
DROP COLUMN IF EXISTS gst_tax_number,
DROP COLUMN IF EXISTS default_tax_rate;


-- ========================================================
-- 35. HARDEN INVOICE TABLE PRIVILEGES
-- ========================================================

-- Remove all existing application-role privileges
REVOKE ALL
ON TABLE public.invoices
FROM anon, authenticated;

-- Anonymous visitors should have no invoice access at all.
-- No grants are added back for anon.

-- Authenticated users need these operations.
-- RLS determines whether the authenticated user is the
-- photographer or client and which rows they may access.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.invoices
TO authenticated;


-- ========================================================
-- 36. HARDEN INVOICE ITEMS TABLE PRIVILEGES
-- ========================================================

REVOKE ALL
ON TABLE public.invoice_items
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.invoice_items
TO authenticated;


-- ========================================================
-- 37. CREATE TABLE FOR PHOTOGRAPHER STRIPE ACCOUNT DETAILS
-- ========================================================

create table public.photographer_stripe_accounts (
    photographer_id uuid primary key
        references public.photographer_profiles(photographer_id)
        on delete cascade,

    stripe_account_id varchar(255) not null unique,

    charges_enabled boolean not null default false,
    payouts_enabled boolean not null default false,
    details_submitted boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ========================================================
-- 38. ENABLE ROW LEVEL SECURITY ON PHOTOGRAPHER STRIPE ACCOUNT DETAILS TABLE
-- ========================================================

alter table public.photographer_stripe_accounts
enable row level security;

-- ========================================================
-- 39. CREATE POLICY FOR PHOTOGRAPHERS TO VIEW THEIR OWN STRIPE ACCOUNT DETAILS
-- ========================================================

create policy "Photographers can view their own Stripe account"
on public.photographer_stripe_accounts
for select
to authenticated
using (
    photographer_id = (
        select private.current_photographer_id()
    )
);


-- ========================================================
-- 40. ALTER PAYMENTS TABLE TO STORE STRIPE PAYMENT DETAILS
-- ========================================================

alter table public.payments
add column stripe_account_id varchar(255),
add column stripe_checkout_session_id varchar(255),
add column stripe_payment_intent_id varchar(255),
add column stripe_charge_id varchar(255);

-- ========================================================
-- 41. ADD UNIQUE CONSTRAINT TO STRIPE CHECKOUT SESSION ID
-- ========================================================

alter table public.payments
add constraint payments_checkout_session_unique
unique (stripe_checkout_session_id);



-- ========================================================
-- 42. DROP POLICY FOR PUBLIC SERVICES
-- ========================================================

drop policy if exists "Active services are publicly visible"
on public.services;

-- ========================================================
-- 43. CREATE POLICY FOR PUBLIC SERVICES   
-- ========================================================

create policy "Public can view active published services"
on public.services
for select
to anon
using (
    is_active = true
    and exists (
        select 1
        from public.photographer_profiles p
        where p.photographer_id = services.photographer_id
          and p.published = true
    )
);

-- ========================================================
-- 44. CREATE POLICY FOR CLIENTS TO VIEW THEIR PHOTOGRAPHER SERVICES
-- ========================================================

create policy "Clients can view their photographers services"
on public.services
for select
to authenticated
using (
    photographer_id = (
        select c.photographer_id
        from public.clients c
        where c.client_id = (
            select private.current_client_id()
        )
        limit 1
    )
);

-- ========================================================
-- 45. REVOKE PUBLIC PRIVILEGES ON SERVICES TABLE
-- ========================================================

revoke all privileges
on table public.services
from anon;

grant select
on table public.services
to anon;

-- ========================================================
-- 46. CREATE POLICY FOR PUBLIC SERVICES
-- ========================================================

create policy "Public can view active published services"
on public.services
for select
to anon
using (
    is_active = true
    and exists (
        select 1
        from public.photographer_profiles p
        where p.photographer_id = services.photographer_id
          and p.published = true
    )
);

-- ========================================================
-- 47. CREATE POLICY FOR CLIENTS TO VIEW THEIR PHOTOGRAPHER SERVICES
-- ========================================================

select
    grantee,
    privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'services'
order by grantee, privilege_type;

-- ========================================================
-- 48. REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA PUBLIC FROM ANON
-- ========================================================

revoke insert, update, delete, truncate, references, trigger
on all tables in schema public
from anon;

-- ========================================================
-- 49. REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA PUBLIC FROM AUTHENTICATED
-- ========================================================

revoke truncate, references, trigger
on all tables in schema public
from authenticated;

-- ========================================================
-- 50. REVOKE SELECT ON TABLES IN SCHEMA PUBLIC FROM ANON
-- ========================================================

revoke select on table
    public.availability_exceptions,
    public.availability_rules,
    public.bookings,
    public.calendar_integrations,
    public.clients,
    public.conversations,
    public.galleries,
    public.media,
    public.media_favourites,
    public.messages,
    public.notifications,
    public.payments,
    public.photographer_stripe_accounts,
    public.profiles,
    public.website_featured_reviews
from anon;

-- ========================================================
-- 51. CREATE POLICY FOR PUBLIC FEATURED REVIEWS
-- ========================================================

create policy "Published featured reviews are public"
on public.website_featured_reviews
for select
to anon, authenticated
using (
    exists (
        select 1
        from public.photographer_profiles p
        join public.reviews r
          on r.photographer_id = p.photographer_id
        where p.photographer_id = website_featured_reviews.photographer_id
          and r.review_id = website_featured_reviews.review_id
          and r.photographer_id = website_featured_reviews.photographer_id
          and p.published = true
          and r.status = 'approved'::review_status
    )
);

-- ========================================================
-- 52. GRANT SELECT ON FEATURED REVIEWS TABLE TO ANON
-- ========================================================

grant select
on table public.website_featured_reviews
to anon;

-- ========================================================
-- 53. DROP POLICY FOR PUBLIC REVIEWS
-- ========================================================

drop policy if exists "Approved reviews are public"
on public.reviews;

-- ========================================================
-- 54. CREATE POLICY FOR PUBLIC REVIEWS
-- ========================================================

create policy "Approved reviews of published photographers are public"
on public.reviews
for select
to anon, authenticated
using (
    status = 'approved'::review_status
    and exists (
        select 1
        from public.photographer_profiles p
        where p.photographer_id = reviews.photographer_id
          and p.published = true
    )
);


-- ========================================================
-- 55. REVOKE ALL DEFAULT PRIVILEGES ON NEW FUTURE TABLES IN SCHEMA PUBLIC FROM ANON, AUTHENTICATED, AND SERVICE_ROLE
-- ========================================================

alter default privileges
for role postgres
in schema public
revoke all privileges on tables from anon;

alter default privileges
for role postgres
in schema public
revoke all privileges on tables from authenticated;

alter default privileges
for role postgres
in schema public
revoke all privileges on tables from service_role;

---------------------------------------------------------
-- 56. REPLACE FUNCTION TO GET PUBLIC REVIEWS FOR A PHOTOGRAPHER - NOW CHECKS THAT THE PHOTOGRAPHER PROFILE IS APPROVED AND PUBLISHED
---------------------------------------------------------

create or replace function public.get_public_reviews(
    p_photographer_id uuid
)
returns table(
    review_id uuid,
    photographer_id uuid,
    rating smallint,
    comment text,
    created_at timestamptz,
    display_name text
)
language sql
stable
security definer
set search_path = ''
as $function$

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

$function$;


-- =========================================================
-- 57. REPLACE FUNCTION TO GET FEATURED REVIEWS FOR A PHOTOGRAPHER - NOW CHECKS THAT THE PHOTOGRAPHER PROFILE IS APPROVED AND PUBLISHED
-- =========================================================

create or replace function public.get_featured_reviews(
    p_photographer_id uuid
)
returns table(
    review_id uuid,
    photographer_id uuid,
    rating smallint,
    comment text,
    created_at timestamptz,
    display_name text,
    display_order smallint
)
language sql
stable
security definer
set search_path = ''
as $function$

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

$function$;



-- =========================================================
-- 58. REVOKE PUBLIC EXECUTE ON FUNCTIONS public.get_public_reviews AND public.get_featured_reviews
-- =========================================================

revoke execute
on function public.get_public_reviews(uuid)
from public;

revoke execute
on function public.get_featured_reviews(uuid)
from public;

grant execute
on function public.get_public_reviews(uuid)
to anon, authenticated;

grant execute
on function public.get_featured_reviews(uuid)
to anon, authenticated;


-- =========================================================
-- 59. REVOKE DEFAULT PRIVILEGES ON FUNCTIONS IN SCHEMA PUBLIC FROM PUBLIC
-- =========================================================

alter default privileges
for role postgres
in schema public
revoke execute on functions from public;

alter default privileges
for role postgres
in schema public
revoke execute on functions from anon;

alter default privileges
for role postgres
in schema public
revoke execute on functions from authenticated;

alter default privileges
for role postgres
in schema public
revoke execute on functions from service_role;

-- =========================================================
-- 60. REVOKE INSERT, UPDATE, DELETE ON TABLE public.photographer_stripe
-- =========================================================

revoke insert, update, delete
on table public.photographer_stripe_accounts
from authenticated;

-- ========================================================
-- 61. CREATE POLICY FOR PHOTOGRAPHERS TO VIEW THEIR OWN STRIPE ACCOUNT DETAILS
-- ========================================================

create policy "Photographers can view own Stripe account"
on public.photographer_stripe_accounts
for select
to authenticated
using (
    photographer_id = (
        select private.current_photographer_id()
    )
);


-- ========================================================
-- 62. DROP POLICY FOR CLIENTS TO CREATE THEIR OWN PAYMENT RECORDS
-- ========================================================

drop policy if exists
    "Clients can create their own payment records"
on public.payments;

-- ========================================================
-- 63. REVOKE INSERT, UPDATE, DELETE ON TABLE public.payments FROM AUTHENTICATED
-- ========================================================

revoke insert, update, delete
on public.payments
from authenticated;

-- ========================================================
-- 64. CREATE UNIQUE INDEX TO PREVENT MULTIPLE PENDING PAYMENTS FOR THE SAME INVOICE
-- ========================================================

create unique index if not exists
    payments_one_pending_per_invoice
on public.payments (invoice_id)
where status = 'pending'::payment_status;

-- ========================================================
-- 65. CREATE UNIQUE INDEX TO PREVENT MULTIPLE SUCCESSFUL PAYMENTS FOR THE SAME INVOICE
-- ========================================================

create unique index if not exists
    payments_one_successful_per_invoice
on public.payments (invoice_id)
where status = 'successful'::payment_status;


-- ========================================================
-- 66. CHECK FOR OVERLAPPING BOOKINGS
-- ========================================================

-- Run this READ-ONLY check first in the shared Supabase SQL editor.
-- Resolve any returned rows before applying 02_enforce_no_overlaps.sql.
SELECT a.booking_id AS booking_a, b.booking_id AS booking_b,
       a.photographer_id, a.booking_date,
       a.start_time AS a_start, a.end_time AS a_end,
       b.start_time AS b_start, b.end_time AS b_end
FROM public.bookings a
JOIN public.bookings b
  ON a.photographer_id = b.photographer_id
 AND a.booking_date = b.booking_date
 AND a.booking_id < b.booking_id
 AND a.start_time < b.end_time AND b.start_time < a.end_time
WHERE a.status IN ('pending','confirmed')
  AND b.status IN ('pending','confirmed')
ORDER BY a.booking_date, a.photographer_id;

-- Also ensure all existing bookings have positive, same-day time ranges.
SELECT booking_id, booking_date, start_time, end_time
FROM public.bookings
WHERE start_time >= end_time;


-- ========================================================
-- 67. CREATE FUNCTION TO GET BUSY TIMES FOR A PHOTOGRAPHER ON A GIVEN DATE
-- ========================================================

-- Apply ONCE to the SHARED Supabase database (used by BOTH LensFlow apps).
-- Returns only occupied start/end times, not private booking data.
-- Do NOT loosen bookings SELECT RLS.
CREATE OR REPLACE FUNCTION public.get_booking_busy_times(
  p_photographer_id uuid,
  p_date date
)
RETURNS TABLE (start_time time without time zone, end_time time without time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
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
$function$;

REVOKE ALL ON FUNCTION public.get_booking_busy_times(uuid, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_booking_busy_times(uuid, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_booking_busy_times(uuid, date) TO authenticated;


-- ========================================================
-- 68. ENFORCE NO OVERLAPPING BOOKINGS
-- ========================================================

-- Apply only AFTER the preflight queries return zero rows.
-- Prevents simultaneous pending/confirmed bookings from overlapping,
-- whether written by either app, Express, or a direct Supabase client.
-- IMPORTANT: Existing overlapping active bookings will cause this to fail.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_valid_time_range
CHECK (start_time < end_time);

ALTER TABLE public.bookings
ADD CONSTRAINT bookings_no_active_overlap
EXCLUDE USING gist (
    photographer_id WITH =,
    booking_date WITH =,
    (
        tsrange(
            booking_date + start_time,
            booking_date + end_time,
            '[)'
        )
    ) WITH &&
)
WHERE (
    status IN (
        'pending'::public.booking_status,
        'confirmed'::public.booking_status
    )
);

-- If already applied, do NOT rerun this ALTER TABLE script.
-- On a race, PostgreSQL returns SQLSTATE 23P01 (exclusion violation).