import {useEffect, useMemo, useRef, useState} from "react";
import {Link, useNavigate, useSearchParams} from "react-router-dom";
import {BiCalendar, BiCheckCircle, BiInfoCircle, BiTimeFive} from "react-icons/bi";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../lib/supabaseClient";
import { apiGetBusyBookingTimes } from "../../services/bookingApi";

import {getClient, formatCurrency, formatDate, formatTime, localToday} from "./bookingHelpers";
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
   TIME HELPERS
   ============================================================ */

function padNumber(value) {
  return String(value).padStart(2, "0");
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


function calculateBookingEndTime(
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

  const endMinutes =
    startMinutes +
    Number(durationMinutes);

  /*
   * Do not allow a service to cross midnight.
   */
  if (
    endMinutes > 1440
  ) {
    return "";
  }

  return minutesToTime(
    endMinutes
  );
}


function getDayOfWeek(
  dateValue
) {
  if (!dateValue) {
    return null;
  }

  const [
    year,
    month,
    day,
  ] = dateValue
    .split("-")
    .map(Number);

  return new Date(
    year,
    month - 1,
    day
  ).getDay();
}


/* ============================================================
   RANGE HELPERS
   ============================================================ */

function mergeRanges(ranges) {
  if (!ranges.length) {
    return [];
  }

  const sorted =
    [...ranges].sort(
      (a, b) =>
        a.start - b.start
    );

  const merged = [
    {
      ...sorted[0],
    },
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
  ranges,
  blockedRange
) {
  const result = [];


  ranges.forEach(
    (range) => {
      /*
       * No overlap.
       */
      if (
        blockedRange.end <=
        range.start ||
        blockedRange.start >=
        range.end
      ) {
        result.push(
          range
        );

        return;
      }


      /*
       * Available section before blocked time.
       */
      if (
        blockedRange.start >
        range.start
      ) {
        result.push({
          start:
            range.start,

          end:
            Math.min(
              blockedRange.start,
              range.end
            ),
        });
      }


      /*
       * Available section after blocked time.
       */
      if (
        blockedRange.end <
        range.end
      ) {
        result.push({
          start:
            Math.max(
              blockedRange.end,
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
  blockedRanges
) {
  let result = [
    ...ranges,
  ];


  blockedRanges.forEach(
    (blockedRange) => {
      result =
        subtractRange(
          result,
          blockedRange
        );
    }
  );


  return result;
}


/* ============================================================
   COMPONENT
   ============================================================ */

export default function NewBooking() {
  const {
    user,
  } = useAuth();

  const navigate =
    useNavigate();

  const [
    searchParams,
  ] =
    useSearchParams();


  const requestedPhotographer =
    searchParams.get(
      "photographer"
    );

  const requestedService =
    searchParams.get(
      "service"
    );


  const submitting =
    useRef(false);


  /* =========================================================
     Loaded data
     ========================================================= */

  const [
    client,
    setClient,
  ] = useState(null);

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
    serviceId,
    setServiceId,
  ] = useState("");

  const [
    date,
    setDate,
  ] = useState("");

  const [
    start,
    setStart,
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
     Selected date data
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
    loadError,
    setLoadError,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const [
    retry,
    setRetry,
  ] = useState(0);

  const [
    saving,
    setSaving,
  ] = useState(false);


  /* =========================================================
     Initial load
     ========================================================= */

  useEffect(
    () => {
      let active = true;


      async function load() {
        setLoading(true);
        setLoadError("");

        setClient(null);
        setServices([]);
        setAvailabilityRules([]);

        setServiceId("");
        setDate("");
        setStart("");


        try {
          const profile =
            await getClient(
              user?.id
            );


          if (
            !profile.photographer_id
          ) {
            throw new Error(
              "No photographer assigned."
            );
          }


          /*
           * A client can only book with their assigned
           * photographer in V1.
           */
          if (
            requestedPhotographer &&
            profile.photographer_id !==
            requestedPhotographer
          ) {
            if (active) {
              setLoadError(
                "Your account is not linked to this photographer. Please contact them to arrange client access before booking."
              );
            }

            return;
          }


          /* -------------------------------------------------
             Services
             ------------------------------------------------- */

          const {
            data:
            serviceData,
            error:
            serviceError,
          } =
            await supabase
              .from("services")
              .select(`
                service_id,
                name,
                description,
                price,
                duration_minutes
              `)
              .eq(
                "photographer_id",
                profile.photographer_id
              )
              .eq(
                "is_active",
                true
              )
              .order(
                "name"
              );


          if (
            serviceError
          ) {
            throw serviceError;
          }


          /* -------------------------------------------------
             Weekly availability
             ------------------------------------------------- */

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
                profile.photographer_id
              )
              .order(
                "day_of_week",
                {
                  ascending: true,
                }
              )
              .order(
                "start_time",
                {
                  ascending: true,
                }
              );


          if (
            rulesError
          ) {
            throw rulesError;
          }


          if (active) {
            const loadedServices =
              serviceData || [];


            setClient(
              profile
            );

            setServices(
              loadedServices
            );

            setAvailabilityRules(
              rulesData || []
            );


            /*
             * Keep support for website service links:
             *
             * /client/bookings/new
             * ?photographer=...
             * &service=...
             */
            if (
              loadedServices.some(
                (item) =>
                  String(
                    item.service_id
                  ) ===
                  requestedService
              )
            ) {
              setServiceId(
                requestedService
              );
            }
          }

        } catch (err) {
          console.error(
            "Unable to load booking services:",
            err
          );


          if (active) {
            setLoadError(
              "We couldn't load your photographer's services or availability. Please try again or contact your photographer."
            );
          }

        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }


      load();


      return () => {
        active = false;
      };
    },
    [
      user?.id,
      retry,
      requestedPhotographer,
      requestedService,
    ]
  );


  /* =========================================================
     Selected service
     ========================================================= */

  const service =
    useMemo(
      () =>
        services.find(
          (item) =>
            String(
              item.service_id
            ) ===
            String(
              serviceId
            )
        ),
      [
        services,
        serviceId,
      ]
    );


  const end =
    calculateBookingEndTime(
      start,
      service?.duration_minutes
    );


  /* =========================================================
     Reset time if service changes
     ========================================================= */

  useEffect(
    () => {
      setStart("");
    },
    [serviceId]
  );


  /* =========================================================
     Selected date data
     ========================================================= */

  useEffect(
    () => {
      setStart("");


      if (
        !client ||
        !date
      ) {
        setDayExceptions(
          []
        );

        setDayBookings(
          []
        );

        return;
      }


      loadSelectedDate(
        client.photographer_id,
        date
      );
    },
    [
      client,
      date,
    ]
  );


  async function fetchSelectedDateData(
    photographerId,
    selectedDate
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
            selectedDate
          )
          .order(
            "start_time",
            {
              ascending: true,
              nullsFirst: true,
            }
          ),

        apiGetBusyBookingTimes(photographerId, selectedDate)
          .then((result) => ({ data: result.data, error: null })),
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
    selectedDate
  ) {
    try {
      setLoadingAvailability(
        true
      );

      setError("");


      const result =
        await fetchSelectedDateData(
          photographerId,
          selectedDate
        );


      setDayExceptions(
        result.exceptions
      );

      setDayBookings(
        result.bookings
      );

    } catch (err) {
      console.error(
        "Unable to load booking availability:",
        err
      );

      // Fail closed: never show open slots when the busy-time lookup failed.
      setDayBookings([]);
      setDayExceptions([{ is_available: false, start_time: null, end_time: null }]);
      setStart("");


      setError(
        "We couldn't check availability for this date. Please try again."
      );

    } finally {
      setLoadingAvailability(
        false
      );
    }
  }


  /* =========================================================
     Calculate available ranges
     ========================================================= */

  function calculateAvailableRanges(
    selectedDate,
    exceptions,
    blockingBookings
  ) {
    if (
      !selectedDate
    ) {
      return [];
    }


    const dayOfWeek =
      getDayOfWeek(
        selectedDate
      );


    const rulesForDay =
      availabilityRules.filter(
        (rule) =>
          Number(
            rule.day_of_week
          ) ===
          dayOfWeek
      );


    /* -------------------------------------------------------
       Normal working hours
       ------------------------------------------------------- */

    let availableRanges =
      rulesForDay
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


    availableRanges =
      mergeRanges(
        availableRanges
      );


    /* -------------------------------------------------------
       Weekly unavailable blocks
       ------------------------------------------------------- */

    const unavailableRules =
      rulesForDay
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


    availableRanges =
      subtractRanges(
        availableRanges,
        unavailableRules
      );


    /* -------------------------------------------------------
       Full-day unavailable exception overrides everything
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


    /* -------------------------------------------------------
       Full-day available exception
       ------------------------------------------------------- */

    const fullDayAvailable =
      exceptions.some(
        (exception) =>
          exception.is_available &&
          !exception.start_time &&
          !exception.end_time
      );


    if (
      fullDayAvailable
    ) {
      availableRanges = [
        {
          start: 0,
          end: 1440,
        },
      ];
    }


    /* -------------------------------------------------------
       Available exceptions ADD time
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


    availableRanges =
      mergeRanges([
        ...availableRanges,
        ...availableExceptions,
      ]);


    /* -------------------------------------------------------
       Unavailable exceptions REMOVE time
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


    availableRanges =
      subtractRanges(
        availableRanges,
        unavailableExceptions
      );


    /* -------------------------------------------------------
       Existing pending / confirmed bookings REMOVE time
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


    availableRanges =
      subtractRanges(
        availableRanges,
        occupiedRanges
      );


    return availableRanges;
  }


  /* =========================================================
     Available ranges
     ========================================================= */

  const availableRanges =
    useMemo(
      () =>
        calculateAvailableRanges(
          date,
          dayExceptions,
          dayBookings
        ),
      [
        date,
        dayExceptions,
        dayBookings,
        availabilityRules,
      ]
    );


  /* =========================================================
     Generate start slots
     ========================================================= */

  const availableSlots =
    useMemo(
      () => {
        if (
          !date ||
          !service
        ) {
          return [];
        }


        const duration =
          Number(
            service.duration_minutes
          );


        if (
          !duration ||
          duration <= 0
        ) {
          return [];
        }


        const slots = [];


        availableRanges.forEach(
          (range) => {
            /*
             * Align to a 30-minute booking grid.
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
              let isPast =
                false;


              /*
               * Do not offer times that have already passed
               * when today's date is selected.
               */
              if (
                date ===
                localToday()
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


              if (
                !isPast
              ) {
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
          ...new Set(
            slots
          ),
        ];

      },
      [
        date,
        service,
        availableRanges,
      ]
    );


  /* =========================================================
     Availability status text
     ========================================================= */

  const availabilityMessage =
    useMemo(
      () => {
        if (!date) {
          return "";
        }


        if (!service) {
          return "Select a photography service to view available times.";
        }


        if (
          loadingAvailability
        ) {
          return "Checking your photographer's availability...";
        }


        if (
          availableSlots.length ===
          0
        ) {
          return "Your photographer has no available times for this service on the selected date.";
        }


        return `${availableSlots.length} ${availableSlots.length ===
            1
            ? "time is"
            : "times are"
          } available.`;
      },
      [
        date,
        service,
        loadingAvailability,
        availableSlots,
      ]
    );


  /* =========================================================
     Submit
     ========================================================= */

  async function handleSubmit(
    event
  ) {
    event.preventDefault();


    if (
      submitting.current
    ) {
      return;
    }


    setError("");


    if (
      !client ||
      !service
    ) {
      setError(
        "Please select an available service."
      );

      return;
    }


    if (
      !date ||
      !start
    ) {
      setError(
        "Please choose an available date and time."
      );

      return;
    }


    const sessionDate =
      new Date(
        `${date}T${start}`
      );


    if (
      Number.isNaN(
        sessionDate.getTime()
      ) ||
      sessionDate <=
      new Date()
    ) {
      setError(
        "Please choose a date and time in the future."
      );

      return;
    }


    if (!end) {
      setError(
        "The selected service cannot be scheduled at this time."
      );

      return;
    }


    submitting.current =
      true;

    setSaving(true);


    try {
      /*
       * Re-read bookings and exceptions immediately before
       * the insert.
       *
       * This protects against a stale time slot if another
       * booking was created while this page was open.
       */
      const freshData =
        await fetchSelectedDateData(
          client.photographer_id,
          date
        );


      const freshRanges =
        calculateAvailableRanges(
          date,
          freshData.exceptions,
          freshData.bookings
        );


      const selectedStart =
        timeToMinutes(
          start
        );

      const selectedEnd =
        timeToMinutes(
          end
        );


      const stillAvailable =
        freshRanges.some(
          (range) =>
            selectedStart >=
            range.start &&
            selectedEnd <=
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

        setStart("");


        throw new Error(
          "That booking time is no longer available. Please choose another available time."
        );
      }


      const {
        data,
        error:
        insertError,
      } =
        await supabase
          .from(
            "bookings"
          )
          .insert({
            client_id:
              client.client_id,

            photographer_id:
              client.photographer_id,

            service_id:
              service.service_id,

            booking_date:
              date,

            start_time:
              start,

            end_time:
              end,

            location:
              location.trim() ||
              null,

            notes:
              notes.trim() ||
              null,

            /*
             * Client bookings remain requests.
             */
            status:
              "pending",

            total_amount:
              service.price,
          })
          .select(
            "booking_id"
          )
          .single();


      if (
        insertError
      ) {
        throw insertError;
      }


      navigate(
        `/client/bookings/${data.booking_id}`,
        {
          replace: true,
        }
      );

    } catch (err) {
      console.error(
        "Unable to request booking:",
        err
      );


      setError(
        err.message ||
        "Your booking request couldn't be saved. Please try again or contact your photographer."
      );

    } finally {
      submitting.current =
        false;

      setSaving(false);
    }
  }


  /* =========================================================
     Render
     ========================================================= */

  return (
    <div className="client-new-booking-page">

      <Link
        className="client-new-booking-back"
        to="/client/bookings"
      >
        ← Back to My Bookings
      </Link>


      <header className="client-new-booking-header">

        <p className="client-new-booking-eyebrow">
          Your photography
        </p>

        <h1>
          New Booking
        </h1>

        <p>
          Choose from your photographer's available
          session times and send a booking request.
        </p>

      </header>


      {/* =====================================================
          Loading
          ===================================================== */}

      {loading ? (
        <div
          className="client-new-booking-state"
          role="status"
        >
          Loading services and availability...
        </div>

      ) : loadError ? (
        <div
          className="client-new-booking-state"
          role="alert"
        >

          <p>
            {loadError}
          </p>

          <button
            type="button"
            onClick={() =>
              setRetry(
                (value) =>
                  value + 1
              )
            }
          >
            Try again
          </button>

        </div>

      ) : services.length ===
        0 ? (
        <div className="client-new-booking-state">

          <h2>
            No services available
          </h2>

          <p>
            Please contact your photographer to arrange
            a session.
          </p>

        </div>

      ) : (
        <form
          className="client-new-booking-layout"
          onSubmit={
            handleSubmit
          }
        >

          {/* =================================================
              Form
              ================================================= */}

          <fieldset
            className="client-new-booking-panel client-new-booking-fields"
            disabled={
              saving
            }
          >

            <legend>
              Session Information
            </legend>


            {/* Service */}

            <div className="client-new-booking-field">

              <label htmlFor="client-service">
                Photography Service
              </label>


              <select
                id="client-service"
                required
                value={
                  serviceId
                }
                onChange={
                  (event) =>
                    setServiceId(
                      event.target.value
                    )
                }
              >

                <option value="">
                  Select a service
                </option>


                {services.map(
                  (item) => (
                    <option
                      key={
                        item.service_id
                      }
                      value={
                        item.service_id
                      }
                    >
                      {item.name}
                      {" — "}
                      {formatCurrency(
                        item.price
                      )}
                    </option>
                  )
                )}

              </select>


              {service && (
                <div className="client-new-booking-service-info">

                  {service.description && (
                    <p>
                      {
                        service.description
                      }
                    </p>
                  )}


                  {service.duration_minutes >
                    0 && (
                      <span>
                        {
                          service.duration_minutes
                        }{" "}
                        minute session
                      </span>
                    )}

                </div>
              )}

            </div>


            {/* Date */}

            <div className="client-new-booking-field">

              <label htmlFor="client-booking-date">
                Preferred Date
              </label>


              <input
                id="client-booking-date"
                type="date"
                required
                min={
                  localToday()
                }
                value={
                  date
                }
                onChange={
                  (event) =>
                    setDate(
                      event.target.value
                    )
                }
              />

            </div>


            {/* =================================================
                Availability
                ================================================= */}

            <section className="client-availability-section">

              <div className="client-availability-heading">

                <div>

                  <p className="client-new-booking-eyebrow">
                    Schedule
                  </p>

                  <h2>
                    Available Times
                  </h2>

                </div>


                {date &&
                  service &&
                  !loadingAvailability &&
                  availableSlots.length >
                  0 && (
                    <span className="client-availability-ready">

                      <BiCheckCircle />

                      Available

                    </span>
                  )}

              </div>


              {!date && (
                <div className="client-availability-placeholder">

                  <BiCalendar />

                  <div>

                    <strong>
                      Choose a date
                    </strong>

                    <p>
                      Select a date to see when your
                      photographer is available.
                    </p>

                  </div>

                </div>
              )}


              {date &&
                !service && (
                  <div className="client-availability-placeholder">

                    <BiInfoCircle />

                    <div>

                      <strong>
                        Choose a service
                      </strong>

                      <p>
                        The service duration determines which
                        booking times are available.
                      </p>

                    </div>

                  </div>
                )}


              {date &&
                service &&
                loadingAvailability && (
                  <div className="client-availability-placeholder">

                    <span className="client-availability-spinner" />

                    <div>

                      <strong>
                        Checking availability
                      </strong>

                      <p>
                        Looking at working hours and existing
                        bookings.
                      </p>

                    </div>

                  </div>
                )}


              {date &&
                service &&
                !loadingAvailability &&
                availableSlots.length ===
                0 && (
                  <div className="client-availability-empty">

                    <BiCalendar />

                    <div>

                      <strong>
                        No times available
                      </strong>

                      <p>
                        {
                          availabilityMessage
                        }
                      </p>

                    </div>

                  </div>
                )}


              {date &&
                service &&
                !loadingAvailability &&
                availableSlots.length >
                0 && (
                  <>

                    <div className="client-availability-date">

                      <BiCalendar />

                      <div>

                        <strong>
                          {formatDate(
                            date
                          )}
                        </strong>

                        <span>
                          {
                            availabilityMessage
                          }
                        </span>

                      </div>

                    </div>


                    <div className="client-availability-slots">

                      {availableSlots.map(
                        (slot) => {
                          const slotEnd =
                            calculateBookingEndTime(
                              slot,
                              service.duration_minutes
                            );


                          return (
                            <button
                              key={
                                slot
                              }
                              type="button"
                              className={
                                start ===
                                  slot
                                  ? "client-availability-slot client-availability-slot-selected"
                                  : "client-availability-slot"
                              }
                              onClick={() =>
                                setStart(
                                  slot
                                )
                              }
                            >

                              <BiTimeFive />

                              <span>
                                {formatTime(
                                  slot
                                )}
                              </span>

                              <small>
                                to{" "}
                                {formatTime(
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

            </section>


            {/* Selected End Time */}

            <div className="client-new-booking-field">

              <label htmlFor="client-booking-end">
                End Time
              </label>


              <input
                id="client-booking-end"
                type="text"
                value={
                  end
                    ? formatTime(
                      end
                    )
                    : ""
                }
                placeholder="Select an available time"
                readOnly
                disabled
              />


              <small>
                Automatically calculated from your selected
                service.
              </small>

            </div>


            {/* Location */}

            <div className="client-new-booking-field">

              <label htmlFor="client-booking-location">
                Preferred Location
                <span>
                  Optional
                </span>
              </label>


              <input
                id="client-booking-location"
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

            <div className="client-new-booking-field">

              <label htmlFor="client-booking-notes">
                Notes or Special Requirements
                <span>
                  Optional
                </span>
              </label>


              <textarea
                id="client-booking-notes"
                rows={5}
                value={
                  notes
                }
                onChange={
                  (event) =>
                    setNotes(
                      event.target.value
                    )
                }
                placeholder="Let your photographer know about any special requirements..."
              />

            </div>

          </fieldset>


          {/* =================================================
              Summary
              ================================================= */}

          <aside className="client-new-booking-panel client-new-booking-summary">

            <p className="client-new-booking-eyebrow">
              Summary
            </p>

            <h2>
              Your Booking Request
            </h2>


            <dl className="client-new-booking-facts">

              <div>
                <dt>
                  Service
                </dt>

                <dd>
                  {service?.name ||
                    "Not selected"}
                </dd>
              </div>


              <div>
                <dt>
                  Duration
                </dt>

                <dd>
                  {service
                    ? `${service.duration_minutes} minutes`
                    : "Not selected"}
                </dd>
              </div>


              <div>
                <dt>
                  Date
                </dt>

                <dd>
                  {date
                    ? formatDate(
                      date
                    )
                    : "Not selected"}
                </dd>
              </div>


              <div>
                <dt>
                  Time
                </dt>

                <dd>
                  {start
                    ? formatTime(
                      start
                    )
                    : "Not selected"}

                  {end &&
                    ` – ${formatTime(
                      end
                    )}`}
                </dd>
              </div>


              <div className="client-new-booking-total">

                <dt>
                  Total
                </dt>

                <dd>
                  {formatCurrency(
                    service?.price
                  )}
                </dd>

              </div>

            </dl>


            <div className="client-new-booking-notice">

              <BiInfoCircle />

              <p>
                Your request will be sent to your photographer
                for confirmation. The selected time is held as
                a pending booking once your request is saved.
              </p>

            </div>


            {error && (
              <p
                className="client-new-booking-error"
                role="alert"
              >
                {error}
              </p>
            )}


            <button
              className="client-new-booking-button"
              type="submit"
              disabled={
                saving ||
                !service ||
                !date ||
                !start
              }
            >
              {saving
                ? "Sending Request..."
                : "Request Booking"}
            </button>


            <button
              className="client-new-booking-button client-new-booking-button-secondary"
              type="button"
              disabled={
                saving
              }
              onClick={() =>
                navigate(
                  "/client/bookings"
                )
              }
            >
              Cancel
            </button>

          </aside>

        </form>
      )}

    </div>
  );
}