import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useNavigate } from "react-router-dom";

import {
  BiCalendar,
  BiCheckCircle,
  BiInfoCircle,
  BiTimeFive,
} from "react-icons/bi";

import { supabase } from "../../lib/supabaseClient";
import { apiCreateBooking } from "../../services/bookingApi";

import "./NewBooking.css";


/* ============================================================
   CONFIG
   ============================================================ */

const SLOT_INTERVAL_MINUTES = 30;

const BLOCKING_BOOKING_STATUSES = [
  "pending",
  "confirmed",
];


/* ============================================================
   DATE / TIME HELPERS
   ============================================================ */

function padNumber(value) {
  return String(value).padStart(2, "0");
}


function getTodayDateKey() {
  const now = new Date();

  return [
    now.getFullYear(),
    padNumber(now.getMonth() + 1),
    padNumber(now.getDate()),
  ].join("-");
}


function parseDateKey(value) {
  const [
    year,
    month,
    day,
  ] = value
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  );
}


function timeToMinutes(value) {
  if (!value) {
    return null;
  }

  const [
    hours,
    minutes,
  ] = value
    .split(":")
    .map(Number);

  return (
    hours * 60 +
    minutes
  );
}


function minutesToTime(value) {
  const hours =
    Math.floor(value / 60);

  const minutes =
    value % 60;

  return `${padNumber(hours)}:${padNumber(minutes)}`;
}


function calculateEndTime(
  start,
  durationMinutes
) {
  if (
    !start ||
    !durationMinutes
  ) {
    return "";
  }

  const startMinutes =
    timeToMinutes(start);

  return minutesToTime(
    startMinutes +
      Number(durationMinutes)
  );
}


function formatDisplayTime(value) {
  if (!value) {
    return "";
  }

  const [
    hours,
    minutes,
  ] = value
    .split(":")
    .map(Number);

  const date = new Date();

  date.setHours(
    hours,
    minutes,
    0,
    0
  );

  return date.toLocaleTimeString(
    "en-NZ",
    {
      hour: "numeric",
      minute: "2-digit",
    }
  );
}


function formatBookingDate(value) {
  if (!value) {
    return "Not selected";
  }

  return parseDateKey(
    value
  ).toLocaleDateString(
    "en-NZ",
    {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    }
  );
}


/* ============================================================
   RANGE HELPERS
   ============================================================ */

function mergeRanges(ranges) {
  if (!ranges.length) {
    return [];
  }

  const sorted =
    [...ranges]
      .sort(
        (a, b) =>
          a.start - b.start
      );

  const merged = [
    { ...sorted[0] },
  ];

  for (
    let index = 1;
    index < sorted.length;
    index += 1
  ) {
    const current =
      sorted[index];

    const previous =
      merged[
        merged.length - 1
      ];

    if (
      current.start <=
      previous.end
    ) {
      previous.end =
        Math.max(
          previous.end,
          current.end
        );
    } else {
      merged.push({
        ...current,
      });
    }
  }

  return merged;
}


function subtractRange(
  sourceRanges,
  block
) {
  const result = [];

  sourceRanges.forEach(
    (range) => {
      /*
       * No overlap.
       */
      if (
        block.end <= range.start ||
        block.start >= range.end
      ) {
        result.push(range);
        return;
      }

      /*
       * Keep section before block.
       */
      if (
        block.start >
        range.start
      ) {
        result.push({
          start:
            range.start,
          end:
            Math.min(
              block.start,
              range.end
            ),
        });
      }

      /*
       * Keep section after block.
       */
      if (
        block.end <
        range.end
      ) {
        result.push({
          start:
            Math.max(
              block.end,
              range.start
            ),
          end:
            range.end,
        });
      }
    }
  );

  return result.filter(
    (range) =>
      range.end >
      range.start
  );
}


function subtractRanges(
  ranges,
  blocks
) {
  let result =
    [...ranges];

  blocks.forEach(
    (block) => {
      result =
        subtractRange(
          result,
          block
        );
    }
  );

  return result;
}


/* ============================================================
   COMPONENT
   ============================================================ */

export default function NewBooking() {
  const navigate =
    useNavigate();


  /* =========================================================
     Core data
     ========================================================= */

  const [
    photographer,
    setPhotographer,
  ] = useState(null);

  const [
    clients,
    setClients,
  ] = useState([]);

  const [
    services,
    setServices,
  ] = useState([]);

  const [
    availabilityRules,
    setAvailabilityRules,
  ] = useState([]);


  /* =========================================================
     Booking fields
     ========================================================= */

  const [
    clientId,
    setClientId,
  ] = useState("");

  const [
    serviceId,
    setServiceId,
  ] = useState("");

  const [
    bookingDate,
    setBookingDate,
  ] = useState("");

  const [
    startTime,
    setStartTime,
  ] = useState("");

  const [
    location,
    setLocation,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");


  /* =========================================================
     Selected-day scheduling data
     ========================================================= */

  const [
    dayExceptions,
    setDayExceptions,
  ] = useState([]);

  const [
    dayBookings,
    setDayBookings,
  ] = useState([]);

  const [
    loadingAvailability,
    setLoadingAvailability,
  ] = useState(false);


  /* =========================================================
     Page state
     ========================================================= */

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");


  /* =========================================================
     Initial data
     ========================================================= */

  useEffect(() => {
    loadBookingData();
  }, []);


  async function loadBookingData() {
    setLoading(true);
    setError("");

    try {
      const {
        data: {
          user,
        },
        error: userError,
      } =
        await supabase.auth.getUser();


      if (userError) {
        throw userError;
      }


      if (!user) {
        throw new Error(
          "You must be logged in to create a booking."
        );
      }


      /* -----------------------------------------------------
         Photographer
         ----------------------------------------------------- */

      const {
        data:
          photographerData,
        error:
          photographerError,
      } =
        await supabase
          .from(
            "photographer_profiles"
          )
          .select(`
            photographer_id,
            user_id,
            business_name
          `)
          .eq(
            "user_id",
            user.id
          )
          .single();


      if (
        photographerError
      ) {
        throw photographerError;
      }


      setPhotographer(
        photographerData
      );


      /* -----------------------------------------------------
         Clients
         ----------------------------------------------------- */

      const {
        data:
          clientData,
        error:
          clientsError,
      } =
        await supabase
          .from("clients")
          .select(`
            client_id,
            user_id
          `)
          .eq(
            "photographer_id",
            photographerData.photographer_id
          );


      if (
        clientsError
      ) {
        throw clientsError;
      }


      const clientUserIds =
        [
          ...new Set(
            (
              clientData || []
            )
              .map(
                (client) =>
                  client.user_id
              )
              .filter(Boolean)
          ),
        ];


      let profileMap = {};


      if (
        clientUserIds.length
      ) {
        const {
          data:
            profiles,
          error:
            profilesError,
        } =
          await supabase
            .from("profiles")
            .select(`
              user_id,
              first_name,
              last_name,
              email
            `)
            .in(
              "user_id",
              clientUserIds
            );


        if (
          profilesError
        ) {
          throw profilesError;
        }


        profileMap =
          Object.fromEntries(
            (
              profiles || []
            ).map(
              (profile) => [
                profile.user_id,
                profile,
              ]
            )
          );
      }


      setClients(
        (
          clientData || []
        ).map(
          (client) => ({
            ...client,

            profile:
              profileMap[
                client.user_id
              ] || null,
          })
        )
      );


      /* -----------------------------------------------------
         Services
         ----------------------------------------------------- */

      const {
        data:
          serviceData,
        error:
          servicesError,
      } =
        await supabase
          .from("services")
          .select(`
            service_id,
            name,
            description,
            price,
            duration_minutes,
            deposit_amount
          `)
          .eq(
            "photographer_id",
            photographerData.photographer_id
          )
          .eq(
            "is_active",
            true
          )
          .order(
            "name",
            {
              ascending: true,
            }
          );


      if (
        servicesError
      ) {
        throw servicesError;
      }


      setServices(
        serviceData || []
      );


      /* -----------------------------------------------------
         Weekly availability
         ----------------------------------------------------- */

      const {
        data:
          rulesData,
        error:
          rulesError,
      } =
        await supabase
          .from(
            "availability_rules"
          )
          .select(`
            availability_rule_id,
            photographer_id,
            day_of_week,
            start_time,
            end_time,
            is_available
          `)
          .eq(
            "photographer_id",
            photographerData.photographer_id
          );


      if (
        rulesError
      ) {
        throw rulesError;
      }


      setAvailabilityRules(
        rulesData || []
      );

    } catch (err) {
      console.error(
        "Error loading booking data:",
        err
      );

      setError(
        err.message ||
          "Unable to load booking information."
      );

    } finally {
      setLoading(false);
    }
  }


  /* =========================================================
     Selected service
     ========================================================= */

  const selectedService =
    useMemo(
      () =>
        services.find(
          (service) =>
            service.service_id ===
            serviceId
        ),
      [
        services,
        serviceId,
      ]
    );


  const endTime =
    calculateEndTime(
      startTime,
      selectedService
        ?.duration_minutes
    );


  /* =========================================================
     Load selected date
     ========================================================= */

  useEffect(
    () => {
      setStartTime("");

      if (
        !photographer ||
        !bookingDate
      ) {
        setDayExceptions([]);
        setDayBookings([]);

        return;
      }


      loadSelectedDate(
        photographer.photographer_id,
        bookingDate
      );
    },
    [
      photographer,
      bookingDate,
    ]
  );


  /*
   * Service duration changes which slots fit.
   * Reset the selected slot whenever service changes.
   */
  useEffect(
    () => {
      setStartTime("");
    },
    [serviceId]
  );


  async function fetchSelectedDateData(
    photographerId,
    date
  ) {
    const [
      exceptionsResult,
      bookingsResult,
    ] =
      await Promise.all([
        supabase
          .from(
            "availability_exceptions"
          )
          .select(`
            exception_id,
            exception_date,
            start_time,
            end_time,
            is_available,
            reason
          `)
          .eq(
            "photographer_id",
            photographerId
          )
          .eq(
            "exception_date",
            date
          )
          .order(
            "start_time",
            {
              ascending: true,
              nullsFirst: true,
            }
          ),

        supabase
          .from("bookings")
          .select(`
            booking_id,
            start_time,
            end_time,
            status
          `)
          .eq(
            "photographer_id",
            photographerId
          )
          .eq(
            "booking_date",
            date
          )
          .in(
            "status",
            BLOCKING_BOOKING_STATUSES
          ),
      ]);


    if (
      exceptionsResult.error
    ) {
      throw exceptionsResult.error;
    }


    if (
      bookingsResult.error
    ) {
      throw bookingsResult.error;
    }


    return {
      exceptions:
        exceptionsResult.data ||
        [],

      bookings:
        bookingsResult.data ||
        [],
    };
  }


  async function loadSelectedDate(
    photographerId,
    date
  ) {
    try {
      setLoadingAvailability(
        true
      );

      setError("");


      const result =
        await fetchSelectedDateData(
          photographerId,
          date
        );


      setDayExceptions(
        result.exceptions
      );

      setDayBookings(
        result.bookings
      );

    } catch (err) {
      console.error(
        "Unable to load availability:",
        err
      );

      setError(
        err.message ||
          "Unable to load availability for this date."
      );

    } finally {
      setLoadingAvailability(
        false
      );
    }
  }


  /* =========================================================
     Availability calculation
     ========================================================= */

  function calculateAvailableRanges(
    date,
    exceptions,
    blockingBookings
  ) {
    if (!date) {
      return [];
    }


    const parsedDate =
      parseDateKey(date);

    const dayOfWeek =
      parsedDate.getDay();


    const dayRules =
      availabilityRules.filter(
        (rule) =>
          Number(
            rule.day_of_week
          ) ===
          dayOfWeek
      );


    /* -------------------------------------------------------
       Normal available hours
       ------------------------------------------------------- */

    let ranges =
      dayRules
        .filter(
          (rule) =>
            rule.is_available
        )
        .map(
          (rule) => ({
            start:
              timeToMinutes(
                rule.start_time
              ),

            end:
              timeToMinutes(
                rule.end_time
              ),
          })
        );


    ranges =
      mergeRanges(ranges);


    /* -------------------------------------------------------
       Weekly unavailable rules
       ------------------------------------------------------- */

    const unavailableRules =
      dayRules
        .filter(
          (rule) =>
            !rule.is_available
        )
        .map(
          (rule) => ({
            start:
              timeToMinutes(
                rule.start_time
              ),

            end:
              timeToMinutes(
                rule.end_time
              ),
          })
        );


    ranges =
      subtractRanges(
        ranges,
        unavailableRules
      );


    /* -------------------------------------------------------
       Full-day exceptions
       ------------------------------------------------------- */

    const fullDayUnavailable =
      exceptions.some(
        (exception) =>
          !exception.is_available &&
          !exception.start_time &&
          !exception.end_time
      );


    if (
      fullDayUnavailable
    ) {
      return [];
    }


    const fullDayAvailable =
      exceptions.some(
        (exception) =>
          exception.is_available &&
          !exception.start_time &&
          !exception.end_time
      );


    /*
     * "Available all day" means the date is opened for
     * the entire calendar day.
     *
     * Timed exceptions are preferable for realistic
     * special working hours.
     */
    if (
      fullDayAvailable
    ) {
      ranges = [
        {
          start: 0,
          end: 1440,
        },
      ];
    }


    /* -------------------------------------------------------
       Timed AVAILABLE exceptions add working time
       ------------------------------------------------------- */

    const availableExceptions =
      exceptions
        .filter(
          (exception) =>
            exception.is_available &&
            exception.start_time &&
            exception.end_time
        )
        .map(
          (exception) => ({
            start:
              timeToMinutes(
                exception.start_time
              ),

            end:
              timeToMinutes(
                exception.end_time
              ),
          })
        );


    ranges =
      mergeRanges([
        ...ranges,
        ...availableExceptions,
      ]);


    /* -------------------------------------------------------
       Timed UNAVAILABLE exceptions remove working time
       ------------------------------------------------------- */

    const unavailableExceptions =
      exceptions
        .filter(
          (exception) =>
            !exception.is_available &&
            exception.start_time &&
            exception.end_time
        )
        .map(
          (exception) => ({
            start:
              timeToMinutes(
                exception.start_time
              ),

            end:
              timeToMinutes(
                exception.end_time
              ),
          })
        );


    ranges =
      subtractRanges(
        ranges,
        unavailableExceptions
      );


    /* -------------------------------------------------------
       Existing bookings remove occupied time
       ------------------------------------------------------- */

    const occupiedRanges =
      blockingBookings.map(
        (booking) => ({
          start:
            timeToMinutes(
              booking.start_time
            ),

          end:
            timeToMinutes(
              booking.end_time
            ),
        })
      );


    ranges =
      subtractRanges(
        ranges,
        occupiedRanges
      );


    return ranges;
  }


  /* =========================================================
     Available slots
     ========================================================= */

  const availableRanges =
    useMemo(
      () =>
        calculateAvailableRanges(
          bookingDate,
          dayExceptions,
          dayBookings
        ),
      [
        bookingDate,
        dayExceptions,
        dayBookings,
        availabilityRules,
      ]
    );


  const availableSlots =
    useMemo(
      () => {
        if (
          !bookingDate ||
          !selectedService
        ) {
          return [];
        }


        const duration =
          Number(
            selectedService.duration_minutes
          );


        const slots = [];


        availableRanges.forEach(
          (range) => {
            /*
             * Align slots to the next 30-minute boundary.
             */
            let cursor =
              Math.ceil(
                range.start /
                  SLOT_INTERVAL_MINUTES
              ) *
              SLOT_INTERVAL_MINUTES;


            while (
              cursor +
                duration <=
              range.end
            ) {
              /*
               * Prevent selecting a time that has already
               * passed when booking today's date.
               */
              let isPast = false;


              if (
                bookingDate ===
                getTodayDateKey()
              ) {
                const now =
                  new Date();

                const currentMinutes =
                  now.getHours() *
                    60 +
                  now.getMinutes();

                isPast =
                  cursor <=
                  currentMinutes;
              }


              if (!isPast) {
                slots.push(
                  minutesToTime(
                    cursor
                  )
                );
              }


              cursor +=
                SLOT_INTERVAL_MINUTES;
            }
          }
        );


        return [
          ...new Set(slots),
        ];
      },
      [
        bookingDate,
        selectedService,
        availableRanges,
      ]
    );


  /* =========================================================
     Availability message
     ========================================================= */

  const availabilityMessage =
    useMemo(
      () => {
        if (!bookingDate) {
          return "";
        }


        if (!serviceId) {
          return "Select a photography service to view available booking times.";
        }


        if (
          loadingAvailability
        ) {
          return "Checking availability...";
        }


        if (
          availableSlots.length ===
          0
        ) {
          return "There are no available times for this service on the selected date.";
        }


        return `${availableSlots.length} booking ${
          availableSlots.length ===
          1
            ? "time is"
            : "times are"
        } available.`;
      },
      [
        bookingDate,
        serviceId,
        loadingAvailability,
        availableSlots,
      ]
    );


  /* =========================================================
     Formatting
     ========================================================= */

  function formatCurrency(
    amount
  ) {
    return new Intl.NumberFormat(
      "en-NZ",
      {
        style: "currency",
        currency: "NZD",
      }
    ).format(
      amount || 0
    );
  }


  function getClientName(
    client
  ) {
    if (
      !client?.profile
    ) {
      return "Unknown Client";
    }


    const name =
      `${
        client.profile.first_name ||
        ""
      } ${
        client.profile.last_name ||
        ""
      }`.trim();


    return (
      name ||
      client.profile.email ||
      "Unknown Client"
    );
  }


  /* =========================================================
     Submit
     ========================================================= */

  async function handleSubmit(
    event
  ) {
    event.preventDefault();

    setError("");


    if (!photographer) {
      setError(
        "Photographer profile could not be found."
      );

      return;
    }


    if (!clientId) {
      setError(
        "Please select a client."
      );

      return;
    }


    if (!serviceId) {
      setError(
        "Please select a service."
      );

      return;
    }


    if (!bookingDate) {
      setError(
        "Please select a booking date."
      );

      return;
    }


    if (!startTime) {
      setError(
        "Please select an available booking time."
      );

      return;
    }


    if (!endTime) {
      setError(
        "Unable to calculate the booking end time."
      );

      return;
    }


    setSaving(true);


    try {
      /*
       * Re-read the selected date immediately before insert.
       *
       * This catches most cases where another booking has
       * been created since this page originally loaded.
       */
      const freshData =
        await fetchSelectedDateData(
          photographer.photographer_id,
          bookingDate
        );


      const freshRanges =
        calculateAvailableRanges(
          bookingDate,
          freshData.exceptions,
          freshData.bookings
        );


      const selectedStartMinutes =
        timeToMinutes(
          startTime
        );

      const selectedEndMinutes =
        timeToMinutes(
          endTime
        );


      const stillAvailable =
        freshRanges.some(
          (range) =>
            selectedStartMinutes >=
              range.start &&
            selectedEndMinutes <=
              range.end
        );


      if (
        !stillAvailable
      ) {
        setDayExceptions(
          freshData.exceptions
        );

        setDayBookings(
          freshData.bookings
        );

        setStartTime("");

        throw new Error(
          "That booking time is no longer available. Please select another available time."
        );
      }


      // Express validates ownership, service pricing and availability again.
      // Do not send photographer_id, status, total_amount or end_time from React.
      const response = await apiCreateBooking({
        client_id: clientId,
        service_id: serviceId,
        booking_date: bookingDate,
        start_time: startTime,
        location: location.trim(),
        notes: notes.trim(),
      });
      const data = response.data;

      navigate(
        `/photographer/bookings/${data.booking_id}`,
        {
          replace: true,
        }
      );

    } catch (err) {
      console.error(
        "Error creating booking:",
        err
      );


      setError(
        err.message ||
          "Unable to create booking."
      );

    } finally {
      setSaving(false);
    }
  }


  /* =========================================================
     Loading
     ========================================================= */

  if (loading) {
    return (
      <div className="new-booking-page">

        <div className="booking-state">
          <p>
            Loading booking information...
          </p>
        </div>

      </div>
    );
  }


  /* =========================================================
     Page
     ========================================================= */

  return (
    <div className="new-booking-page">

      {/* =====================================================
          Header
          ===================================================== */}

      <header className="new-booking-header">

        <div>

          <button
            type="button"
            className="back-button"
            onClick={() =>
              navigate(
                "/photographer/bookings"
              )
            }
          >
            ← Back to Bookings
          </button>


          <p className="page-eyebrow">
            LensFlow
          </p>


          <h1>
            New Booking
          </h1>


          <p className="page-description">
            Create a photography booking using your
            configured availability and existing schedule.
          </p>

        </div>

      </header>


      {/* =====================================================
          Error
          ===================================================== */}

      {error && (
        <div className="new-booking-error">

          <strong>
            Unable to create booking
          </strong>

          <p>
            {error}
          </p>

        </div>
      )}


      {/* =====================================================
          Form
          ===================================================== */}

      <form
        className="new-booking-layout"
        onSubmit={
          handleSubmit
        }
      >

        <section className="booking-form-card">

          <div className="form-section-heading">

            <p className="section-eyebrow">
              Booking details
            </p>

            <h2>
              Session Information
            </h2>

          </div>


          <div className="form-grid">

            {/* Client */}

            <div className="form-field">

              <label htmlFor="client">
                Client
              </label>

              <select
                id="client"
                value={
                  clientId
                }
                onChange={
                  (event) =>
                    setClientId(
                      event.target.value
                    )
                }
                required
              >

                <option value="">
                  Select a client
                </option>


                {clients.map(
                  (client) => (
                    <option
                      key={
                        client.client_id
                      }
                      value={
                        client.client_id
                      }
                    >
                      {getClientName(
                        client
                      )}
                    </option>
                  )
                )}

              </select>


              {clients.length ===
                0 && (
                <small>
                  No clients are currently available.
                </small>
              )}

            </div>


            {/* Service */}

            <div className="form-field">

              <label htmlFor="service">
                Photography Service
              </label>


              <select
                id="service"
                value={
                  serviceId
                }
                onChange={
                  (event) =>
                    setServiceId(
                      event.target.value
                    )
                }
                required
              >

                <option value="">
                  Select a service
                </option>


                {services.map(
                  (service) => (
                    <option
                      key={
                        service.service_id
                      }
                      value={
                        service.service_id
                      }
                    >
                      {service.name}
                      {" — "}
                      {formatCurrency(
                        service.price
                      )}
                    </option>
                  )
                )}

              </select>


              {selectedService && (
                <small>
                  {
                    selectedService.duration_minutes
                  }{" "}
                  minute session
                </small>
              )}


              {services.length ===
                0 && (
                <small>
                  No active services are currently available.
                </small>
              )}

            </div>


            {/* Date */}

            <div className="form-field">

              <label htmlFor="booking-date">
                Date
              </label>


              <input
                id="booking-date"
                type="date"
                value={
                  bookingDate
                }
                min={
                  getTodayDateKey()
                }
                onChange={
                  (event) =>
                    setBookingDate(
                      event.target.value
                    )
                }
                required
              />

            </div>


            {/* End time preview */}

            <div className="form-field">

              <label htmlFor="end-time">
                End Time
              </label>


              <input
                id="end-time"
                type="text"
                value={
                  endTime
                    ? formatDisplayTime(
                        endTime
                      )
                    : ""
                }
                placeholder="Select an available time"
                readOnly
                disabled
              />


              <small>
                Automatically calculated from the selected service.
              </small>

            </div>

          </div>


          {/* =================================================
              Availability
              ================================================= */}

          <div className="booking-availability-section">

            <div className="booking-availability-heading">

              <div>

                <p className="section-eyebrow">
                  Schedule
                </p>

                <h3>
                  Available Times
                </h3>

              </div>


              {bookingDate &&
                selectedService &&
                !loadingAvailability &&
                availableSlots.length >
                  0 && (
                  <span className="availability-ready-badge">
                    <BiCheckCircle />

                    Available
                  </span>
                )}

            </div>


            {!bookingDate && (
              <div className="availability-placeholder">

                <BiCalendar />

                <div>
                  <strong>
                    Select a date
                  </strong>

                  <p>
                    Choose a date to check your configured
                    working hours.
                  </p>
                </div>

              </div>
            )}


            {bookingDate &&
              !selectedService && (
              <div className="availability-placeholder">

                <BiInfoCircle />

                <div>
                  <strong>
                    Select a service
                  </strong>

                  <p>
                    LensFlow needs the service duration before
                    it can calculate valid booking times.
                  </p>
                </div>

              </div>
            )}


            {bookingDate &&
              selectedService &&
              loadingAvailability && (
              <div className="availability-placeholder">

                <span className="availability-spinner" />

                <div>
                  <strong>
                    Checking availability
                  </strong>

                  <p>
                    Looking at working hours, exceptions and
                    existing bookings.
                  </p>
                </div>

              </div>
            )}


            {bookingDate &&
              selectedService &&
              !loadingAvailability &&
              availableSlots.length ===
                0 && (
              <div className="availability-empty">

                <BiCalendar />

                <div>
                  <strong>
                    No times available
                  </strong>

                  <p>
                    {availabilityMessage}
                  </p>
                </div>

              </div>
            )}


            {bookingDate &&
              selectedService &&
              !loadingAvailability &&
              availableSlots.length >
                0 && (
              <>
                <div className="availability-date-summary">

                  <BiCalendar />

                  <div>
                    <strong>
                      {formatBookingDate(
                        bookingDate
                      )}
                    </strong>

                    <span>
                      {availabilityMessage}
                    </span>
                  </div>

                </div>


                <div className="availability-slots">

                  {availableSlots.map(
                    (slot) => {
                      const slotEnd =
                        calculateEndTime(
                          slot,
                          selectedService.duration_minutes
                        );


                      return (
                        <button
                          key={
                            slot
                          }
                          type="button"
                          className={
                            startTime ===
                            slot
                              ? "availability-slot availability-slot--selected"
                              : "availability-slot"
                          }
                          onClick={() =>
                            setStartTime(
                              slot
                            )
                          }
                        >

                          <BiTimeFive />

                          <span>
                            {formatDisplayTime(
                              slot
                            )}
                          </span>

                          <small>
                            to{" "}
                            {formatDisplayTime(
                              slotEnd
                            )}
                          </small>

                        </button>
                      );
                    }
                  )}

                </div>
              </>
            )}

          </div>


          {/* Location */}

          <div className="form-field form-field-full">

            <label htmlFor="location">
              Location
            </label>

            <input
              id="location"
              type="text"
              value={
                location
              }
              onChange={
                (event) =>
                  setLocation(
                    event.target.value
                  )
              }
              placeholder="e.g. Mount Maunganui Beach"
            />

          </div>


          {/* Notes */}

          <div className="form-field form-field-full">

            <label htmlFor="notes">
              Notes
            </label>

            <textarea
              id="notes"
              value={
                notes
              }
              onChange={
                (event) =>
                  setNotes(
                    event.target.value
                  )
              }
              placeholder="Add any notes or special requirements..."
              rows="5"
            />

          </div>

        </section>


        {/* ===================================================
            Summary
            =================================================== */}

        <aside className="booking-summary-card">

          <div className="form-section-heading">

            <p className="section-eyebrow">
              Summary
            </p>

            <h2>
              Booking Summary
            </h2>

          </div>


          <div className="summary-content">

            <div className="summary-row">

              <span>
                Client
              </span>

              <strong>
                {clientId
                  ? getClientName(
                      clients.find(
                        (client) =>
                          client.client_id ===
                          clientId
                      )
                    )
                  : "Not selected"}
              </strong>

            </div>


            <div className="summary-row">

              <span>
                Service
              </span>

              <strong>
                {selectedService
                  ?.name ||
                  "Not selected"}
              </strong>

            </div>


            <div className="summary-row">

              <span>
                Duration
              </span>

              <strong>
                {selectedService
                  ? `${selectedService.duration_minutes} minutes`
                  : "Not selected"}
              </strong>

            </div>


            <div className="summary-row">

              <span>
                Date
              </span>

              <strong>
                {bookingDate
                  ? formatBookingDate(
                      bookingDate
                    )
                  : "Not selected"}
              </strong>

            </div>


            <div className="summary-row">

              <span>
                Time
              </span>

              <strong>
                {startTime &&
                endTime
                  ? `${formatDisplayTime(
                      startTime
                    )} – ${formatDisplayTime(
                      endTime
                    )}`
                  : "Not selected"}
              </strong>

            </div>


            <div className="summary-divider" />


            <div className="summary-total">

              <span>
                Total
              </span>

              <strong>
                {formatCurrency(
                  selectedService
                    ?.price ||
                    0
                )}
              </strong>

            </div>

          </div>


          <button
            type="submit"
            className="primary-button create-booking-button"
            disabled={
              saving ||
              !clientId ||
              !serviceId ||
              !bookingDate ||
              !startTime
            }
          >
            {saving
              ? "Creating Booking..."
              : "Create Booking"}
          </button>


          <button
            type="button"
            className="secondary-button cancel-booking-button"
            onClick={() =>
              navigate(
                "/photographer/bookings"
              )
            }
            disabled={
              saving
            }
          >
            Cancel
          </button>

        </aside>

      </form>

    </div>
  );
}