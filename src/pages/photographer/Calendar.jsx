import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BiCalendar,
  BiCheckCircle,
  BiChevronLeft,
  BiChevronRight,
  BiCog,
  BiFilterAlt,
  BiMap,
  BiPlus,
  BiRefresh,
  BiTimeFive,
  BiTrash,
  BiUser,
  BiXCircle,
} from "react-icons/bi";

import {
  apiGetCalendar,
  apiCreateCalendarRule,
  apiDeleteCalendarRule,
  apiCreateCalendarException,
  apiDeleteCalendarException,
} from "../../services/calendarApi";

import "./Calendar.css";


/* ============================================================
   CONSTANTS
   ============================================================ */

const STATUS_OPTIONS = [
  {
    value: "all",
    label: "All bookings",
  },
  {
    value: "pending",
    label: "Pending",
  },
  {
    value: "confirmed",
    label: "Confirmed",
  },
  {
    value: "completed",
    label: "Completed",
  },
  {
    value: "cancelled",
    label: "Cancelled",
  },
  {
    value: "declined",
    label: "Declined",
  },
];


const WEEKDAY_LABELS = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];


/*
 * availability_rules.day_of_week convention:
 *
 * 0 = Sunday
 * 1 = Monday
 * 2 = Tuesday
 * 3 = Wednesday
 * 4 = Thursday
 * 5 = Friday
 * 6 = Saturday
 */

const AVAILABILITY_DAYS = [
  {
    value: 1,
    label: "Monday",
  },
  {
    value: 2,
    label: "Tuesday",
  },
  {
    value: 3,
    label: "Wednesday",
  },
  {
    value: 4,
    label: "Thursday",
  },
  {
    value: 5,
    label: "Friday",
  },
  {
    value: 6,
    label: "Saturday",
  },
  {
    value: 0,
    label: "Sunday",
  },
];


const EMPTY_RULE_FORM = {
  day_of_week: 1,
  start_time: "09:00",
  end_time: "17:00",
  is_available: true,
};


const EMPTY_EXCEPTION_FORM = {
  exception_date: "",
  start_time: "",
  end_time: "",
  is_available: false,
  reason: "",
  full_day: true,
};


/* ============================================================
   DATE HELPERS
   ============================================================ */

function padNumber(value) {
  return String(value).padStart(2, "0");
}


function formatDateKey(date) {
  return [
    date.getFullYear(),
    padNumber(date.getMonth() + 1),
    padNumber(date.getDate()),
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


function startOfMonth(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}


function endOfMonth(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0
  );
}


function addDays(date, amount) {
  const next =
    new Date(date);

  next.setDate(
    next.getDate() + amount
  );

  return next;
}


function getCalendarStart(date) {
  const firstDay =
    startOfMonth(date);

  const mondayOffset =
    (firstDay.getDay() + 6) % 7;

  return addDays(
    firstDay,
    -mondayOffset
  );
}


function getCalendarEnd(date) {
  const lastDay =
    endOfMonth(date);

  const sundayOffset =
    6 -
    ((lastDay.getDay() + 6) % 7);

  return addDays(
    lastDay,
    sundayOffset
  );
}


function formatMonthHeading(date) {
  return date.toLocaleDateString(
    "en-NZ",
    {
      month: "long",
      year: "numeric",
    }
  );
}


function formatLongDate(value) {
  return parseDateKey(
    value
  ).toLocaleDateString(
    "en-NZ",
    {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );
}


function formatShortDate(value) {
  return parseDateKey(
    value
  ).toLocaleDateString(
    "en-NZ",
    {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    }
  );
}


function formatShortTime(value) {
  if (!value) {
    return "";
  }

  const [
    hour,
    minute,
  ] = value
    .split(":")
    .map(Number);

  const date =
    new Date();

  date.setHours(
    hour,
    minute,
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


function formatCurrency(value) {
  return new Intl.NumberFormat(
    "en-NZ",
    {
      style: "currency",
      currency: "NZD",
    }
  ).format(
    Number(value || 0)
  );
}


function getDayLabel(dayNumber) {
  return (
    AVAILABILITY_DAYS.find(
      (day) =>
        day.value ===
        Number(dayNumber)
    )?.label ||
    "Unknown day"
  );
}


function getClientName(booking) {
  const firstName =
    booking.client?.first_name || "";

  const lastName =
    booking.client?.last_name || "";

  return (
    `${firstName} ${lastName}`.trim() ||
    "Client"
  );
}


/* ============================================================
   COMPONENT
   ============================================================ */

export default function Calendar() {
  const today =
    useMemo(
      () => new Date(),
      []
    );

  const todayKey =
    useMemo(
      () =>
        formatDateKey(today),
      [today]
    );


  /* =========================================================
     Calendar state
     ========================================================= */

  const [
    currentMonth,
    setCurrentMonth,
  ] = useState(
    startOfMonth(today)
  );

  const [
    selectedDate,
    setSelectedDate,
  ] = useState(todayKey);

  const [
    photographerId,
    setPhotographerId,
  ] = useState("");

  const [
    bookings,
    setBookings,
  ] = useState([]);

  const [
    statusFilter,
    setStatusFilter,
  ] = useState("all");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    refreshing,
    setRefreshing,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState("");


  /* =========================================================
     Availability state
     ========================================================= */

  const [
    availabilityRules,
    setAvailabilityRules,
  ] = useState([]);

  const [
    availabilityExceptions,
    setAvailabilityExceptions,
  ] = useState([]);

  const [
    showAvailabilityManager,
    setShowAvailabilityManager,
  ] = useState(false);

  const [
    ruleForm,
    setRuleForm,
  ] = useState(
    EMPTY_RULE_FORM
  );

  const [
    exceptionForm,
    setExceptionForm,
  ] = useState({
    ...EMPTY_EXCEPTION_FORM,
    exception_date: todayKey,
  });

  const [
    savingRule,
    setSavingRule,
  ] = useState(false);

  const [
    savingException,
    setSavingException,
  ] = useState(false);

  const [
    availabilityMessage,
    setAvailabilityMessage,
  ] = useState("");

  const [
    availabilityError,
    setAvailabilityError,
  ] = useState("");


  /* =========================================================
     Calendar range
     ========================================================= */

  const calendarStart =
    useMemo(
      () =>
        getCalendarStart(
          currentMonth
        ),
      [currentMonth]
    );

  const calendarEnd =
    useMemo(
      () =>
        getCalendarEnd(
          currentMonth
        ),
      [currentMonth]
    );


  const calendarDays =
    useMemo(
      () => {
        const days = [];

        let cursor =
          new Date(
            calendarStart
          );

        while (
          cursor <=
          calendarEnd
        ) {
          days.push(
            new Date(cursor)
          );

          cursor =
            addDays(
              cursor,
              1
            );
        }

        return days;
      },
      [
        calendarStart,
        calendarEnd,
      ]
    );


  /* =========================================================
     Load all calendar data through Express REST API
     ========================================================= */

  const calendarRequestId = useRef(0);

  const loadCalendarData = useCallback(async () => {
    const requestId = ++calendarRequestId.current;
    const response = await apiGetCalendar(
      formatDateKey(calendarStart),
      formatDateKey(calendarEnd)
    );
    if (requestId !== calendarRequestId.current) return;
    const data = response.data;
    setPhotographerId(data.photographer_id);
    setBookings(data.bookings || []);
    setAvailabilityRules(data.availability_rules || []);
    setAvailabilityExceptions(data.availability_exceptions || []);
  }, [calendarStart, calendarEnd]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setError("");
        // The component remains mounted during normal month changes.
        // Ignore obsolete error messages after a month switch.
        await loadCalendarData();
      } catch (loadError) {
        if (!cancelled) {
          console.error("Unable to load calendar:", loadError);
          setError(loadError.message || "Unable to load the calendar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [loadCalendarData]);

  async function handleRefresh() {
    try {
      setRefreshing(true);
      setError("");
      await loadCalendarData();
    } catch (refreshError) {
      console.error("Unable to refresh calendar:", refreshError);
      setError(refreshError.message || "Unable to refresh the calendar.");
    } finally {
      setRefreshing(false);
    }
  }

  /* =========================================================
     Booking derived values
     ========================================================= */

  const filteredBookings =
    useMemo(
      () => {
        if (
          statusFilter ===
          "all"
        ) {
          return bookings;
        }


        return bookings.filter(
          (booking) =>
            booking.status ===
            statusFilter
        );
      },
      [
        bookings,
        statusFilter,
      ]
    );


  const bookingsByDate =
    useMemo(
      () => {
        const grouped =
          new Map();


        filteredBookings.forEach(
          (booking) => {
            const current =
              grouped.get(
                booking.booking_date
              ) || [];


            current.push(
              booking
            );


            grouped.set(
              booking.booking_date,
              current
            );
          }
        );


        return grouped;
      },
      [
        filteredBookings,
      ]
    );


  const selectedBookings =
    useMemo(
      () =>
        bookingsByDate.get(
          selectedDate
        ) || [],
      [
        bookingsByDate,
        selectedDate,
      ]
    );


  const monthBookings =
    useMemo(
      () =>
        filteredBookings.filter(
          (booking) => {
            const date =
              parseDateKey(
                booking.booking_date
              );


            return (
              date.getMonth() ===
                currentMonth.getMonth() &&
              date.getFullYear() ===
                currentMonth.getFullYear()
            );
          }
        ),
      [
        filteredBookings,
        currentMonth,
      ]
    );


  const monthConfirmed =
    monthBookings.filter(
      (booking) =>
        booking.status ===
        "confirmed"
    ).length;


  const monthPending =
    monthBookings.filter(
      (booking) =>
        booking.status ===
        "pending"
    ).length;


  /* =========================================================
     Availability derived values
     ========================================================= */

  const exceptionsByDate =
    useMemo(
      () => {
        const grouped =
          new Map();


        availabilityExceptions.forEach(
          (exception) => {
            const existing =
              grouped.get(
                exception.exception_date
              ) || [];


            existing.push(
              exception
            );


            grouped.set(
              exception.exception_date,
              existing
            );
          }
        );


        return grouped;
      },
      [
        availabilityExceptions,
      ]
    );


  function getRulesForDate(
    date
  ) {
    const dayNumber =
      date.getDay();


    return availabilityRules.filter(
      (rule) =>
        Number(
          rule.day_of_week
        ) ===
        dayNumber
    );
  }


  function getAvailabilityState(
    date
  ) {
    const dateKey =
      formatDateKey(date);

    const exceptions =
      exceptionsByDate.get(
        dateKey
      ) || [];

    const fullDayException =
      exceptions.find(
        (exception) =>
          !exception.start_time &&
          !exception.end_time
      );


    if (
      fullDayException
    ) {
      return fullDayException.is_available
        ? "special-available"
        : "unavailable";
    }


    if (
      exceptions.length
    ) {
      const availableException =
        exceptions.some(
          (exception) =>
            exception.is_available
        );


      const unavailableException =
        exceptions.some(
          (exception) =>
            !exception.is_available
        );


      if (
        availableException &&
        !unavailableException
      ) {
        return "special-available";
      }


      if (
        unavailableException
      ) {
        return "partial-exception";
      }
    }


    const rules =
      getRulesForDate(date);


    if (
      rules.some(
        (rule) =>
          rule.is_available
      )
    ) {
      return "available";
    }


    return "no-rule";
  }


  const selectedDateObject =
    useMemo(
      () =>
        parseDateKey(
          selectedDate
        ),
      [selectedDate]
    );


  const selectedRules =
    useMemo(
      () =>
        availabilityRules.filter(
          (rule) =>
            Number(
              rule.day_of_week
            ) ===
            selectedDateObject.getDay()
        ),
      [
        availabilityRules,
        selectedDateObject,
      ]
    );


  const selectedExceptions =
    exceptionsByDate.get(
      selectedDate
    ) || [];


  /* =========================================================
     Calendar navigation
     ========================================================= */

  function goPreviousMonth() {
    const previous =
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - 1,
        1
      );


    setCurrentMonth(
      previous
    );


    setSelectedDate(
      formatDateKey(
        previous
      )
    );
  }


  function goNextMonth() {
    const next =
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        1
      );


    setCurrentMonth(
      next
    );


    setSelectedDate(
      formatDateKey(
        next
      )
    );
  }


  function goToday() {
    const now =
      new Date();


    setCurrentMonth(
      startOfMonth(now)
    );


    setSelectedDate(
      formatDateKey(now)
    );
  }


  function handleSelectDay(
    date
  ) {
    const dateKey =
      formatDateKey(date);


    setSelectedDate(
      dateKey
    );


    setExceptionForm(
      (current) => ({
        ...current,
        exception_date:
          dateKey,
      })
    );
  }


  /* =========================================================
     Create availability rule
     ========================================================= */

  async function handleCreateRule(
    event
  ) {
    event.preventDefault();


    if (
      !photographerId
    ) {
      return;
    }


    if (
      !ruleForm.start_time ||
      !ruleForm.end_time
    ) {
      setAvailabilityError(
        "Start time and end time are required."
      );

      return;
    }


    if (
      ruleForm.start_time >=
      ruleForm.end_time
    ) {
      setAvailabilityError(
        "Start time must be earlier than end time."
      );

      return;
    }


    try {
      setSavingRule(true);

      setAvailabilityError("");
      setAvailabilityMessage("");


      await apiCreateCalendarRule({
        day_of_week: Number(ruleForm.day_of_week),
        start_time: ruleForm.start_time,
        end_time: ruleForm.end_time,
        is_available: Boolean(ruleForm.is_available),
      });

      setRuleForm(
        EMPTY_RULE_FORM
      );


      setAvailabilityMessage(
        "Weekly availability rule added."
      );


      await loadCalendarData();

    } catch (
      saveError
    ) {
      console.error(
        "Unable to create availability rule:",
        saveError
      );


      setAvailabilityError(
        saveError.message ||
          "Unable to create the availability rule."
      );

    } finally {
      setSavingRule(false);
    }
  }


  /* =========================================================
     Delete availability rule
     ========================================================= */

  async function handleDeleteRule(
    ruleId
  ) {
    try {
      setAvailabilityError("");
      setAvailabilityMessage("");


      await apiDeleteCalendarRule(ruleId);

      setAvailabilityMessage(
        "Availability rule removed."
      );


      await loadCalendarData();

    } catch (
      deleteError
    ) {
      console.error(
        "Unable to delete availability rule:",
        deleteError
      );


      setAvailabilityError(
        deleteError.message ||
          "Unable to delete the availability rule."
      );
    }
  }


  /* =========================================================
     Create exception
     ========================================================= */

  async function handleCreateException(
    event
  ) {
    event.preventDefault();


    if (
      !exceptionForm.exception_date
    ) {
      setAvailabilityError(
        "Exception date is required."
      );

      return;
    }


    if (
      !exceptionForm.full_day
    ) {
      if (
        !exceptionForm.start_time ||
        !exceptionForm.end_time
      ) {
        setAvailabilityError(
          "Start and end times are required for a partial-day exception."
        );

        return;
      }


      if (
        exceptionForm.start_time >=
        exceptionForm.end_time
      ) {
        setAvailabilityError(
          "Start time must be earlier than end time."
        );

        return;
      }
    }


    try {
      setSavingException(
        true
      );

      setAvailabilityError("");
      setAvailabilityMessage("");


      await apiCreateCalendarException({
        exception_date: exceptionForm.exception_date,
        start_time: exceptionForm.full_day ? null : exceptionForm.start_time,
        end_time: exceptionForm.full_day ? null : exceptionForm.end_time,
        is_available: Boolean(exceptionForm.is_available),
        reason: exceptionForm.reason.trim() || null,
      });

      setAvailabilityMessage(
        "Availability exception added."
      );


      setExceptionForm({
        ...EMPTY_EXCEPTION_FORM,
        exception_date:
          exceptionForm.exception_date,
      });


      await loadCalendarData();

    } catch (
      saveError
    ) {
      console.error(
        "Unable to create availability exception:",
        saveError
      );


      setAvailabilityError(
        saveError.message ||
          "Unable to create the availability exception."
      );

    } finally {
      setSavingException(
        false
      );
    }
  }


  /* =========================================================
     Delete exception
     ========================================================= */

  async function handleDeleteException(
    exceptionId
  ) {
    try {
      setAvailabilityError("");
      setAvailabilityMessage("");


      await apiDeleteCalendarException(exceptionId);

      setAvailabilityMessage(
        "Availability exception removed."
      );


      await loadCalendarData();

    } catch (
      deleteError
    ) {
      console.error(
        "Unable to delete availability exception:",
        deleteError
      );


      setAvailabilityError(
        deleteError.message ||
          "Unable to delete the availability exception."
      );
    }
  }


  /* =========================================================
     Loading
     ========================================================= */

  if (loading) {
    return (
      <div className="calendar-page">

        <div className="calendar-loading">

          <span className="calendar-spinner" />

          <p>
            Loading calendar...
          </p>

        </div>

      </div>
    );
  }


  /* =========================================================
     Render
     ========================================================= */

  return (
    <div className="calendar-page">

      {/* =====================================================
          Header
          ===================================================== */}

      <section className="calendar-page-header">

        <div>
          <span className="calendar-eyebrow">
            Schedule
          </span>

          <h1>
            Calendar
          </h1>

          <p>
            View bookings, working hours and availability.
          </p>
        </div>


        <div className="calendar-header-actions">

          <button
            type="button"
            className="calendar-refresh-button"
            onClick={
              handleRefresh
            }
            disabled={
              refreshing
            }
          >
            <BiRefresh
              aria-hidden="true"
            />

            {refreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>


          <button
            type="button"
            className="calendar-primary-button"
            onClick={() =>
              setShowAvailabilityManager(
                (current) =>
                  !current
              )
            }
          >
            <BiCog
              aria-hidden="true"
            />

            {showAvailabilityManager
              ? "Hide Availability"
              : "Manage Availability"}
          </button>

        </div>

      </section>


      {/* =====================================================
          Availability manager
          ===================================================== */}

      {showAvailabilityManager && (
        <section className="calendar-availability-manager">

          <div className="calendar-manager-header">

            <div>
              <span className="calendar-eyebrow">
                Scheduling preferences
              </span>

              <h2>
                Manage Availability
              </h2>

              <p>
                Define your normal weekly hours and
                create exceptions for specific dates.
              </p>
            </div>

          </div>


          {availabilityError && (
            <div className="calendar-error">
              {availabilityError}
            </div>
          )}


          {availabilityMessage && (
            <div className="calendar-success">
              <BiCheckCircle
                aria-hidden="true"
              />

              {availabilityMessage}
            </div>
          )}


          <div className="calendar-manager-grid">

            {/* Weekly availability */}

            <div className="calendar-manager-card">

              <div className="calendar-manager-card-heading">

                <div>
                  <h3>
                    Weekly Availability
                  </h3>

                  <p>
                    Set your normal recurring working
                    hours.
                  </p>
                </div>

              </div>


              <div className="calendar-rule-list">

                {availabilityRules.length ===
                0 ? (
                  <div className="calendar-manager-empty">
                    No weekly availability has been
                    configured yet.
                  </div>
                ) : (
                  AVAILABILITY_DAYS.map(
                    (day) => {
                      const rules =
                        availabilityRules.filter(
                          (rule) =>
                            Number(
                              rule.day_of_week
                            ) ===
                            day.value
                        );


                      if (
                        !rules.length
                      ) {
                        return null;
                      }


                      return (
                        <div
                          key={
                            day.value
                          }
                          className="calendar-rule-day"
                        >
                          <strong>
                            {
                              day.label
                            }
                          </strong>


                          <div className="calendar-rule-day-items">

                            {rules.map(
                              (rule) => (
                                <div
                                  key={
                                    rule.availability_rule_id
                                  }
                                  className="calendar-rule-item"
                                >

                                  <div>
                                    <span
                                      className={
                                        rule.is_available
                                          ? "calendar-availability-badge calendar-availability-badge--available"
                                          : "calendar-availability-badge calendar-availability-badge--unavailable"
                                      }
                                    >
                                      {rule.is_available
                                        ? "Available"
                                        : "Unavailable"}
                                    </span>

                                    <p>
                                      {formatShortTime(
                                        rule.start_time
                                      )}
                                      {" – "}
                                      {formatShortTime(
                                        rule.end_time
                                      )}
                                    </p>
                                  </div>


                                  <button
                                    type="button"
                                    className="calendar-delete-button"
                                    onClick={() =>
                                      handleDeleteRule(
                                        rule.availability_rule_id
                                      )
                                    }
                                    aria-label="Delete availability rule"
                                    title="Delete rule"
                                  >
                                    <BiTrash
                                      aria-hidden="true"
                                    />
                                  </button>

                                </div>
                              )
                            )}

                          </div>

                        </div>
                      );
                    }
                  )
                )}

              </div>


              <form
                className="calendar-manager-form"
                onSubmit={
                  handleCreateRule
                }
              >

                <div className="calendar-form-heading">
                  <BiPlus
                    aria-hidden="true"
                  />

                  <strong>
                    Add weekly rule
                  </strong>
                </div>


                <div className="calendar-form-grid">

                  <div className="calendar-field calendar-field--full">
                    <label htmlFor="availability-day">
                      Day
                    </label>

                    <select
                      id="availability-day"
                      value={
                        ruleForm.day_of_week
                      }
                      onChange={
                        (event) =>
                          setRuleForm(
                            (current) => ({
                              ...current,

                              day_of_week:
                                Number(
                                  event.target.value
                                ),
                            })
                          )
                      }
                    >
                      {AVAILABILITY_DAYS.map(
                        (day) => (
                          <option
                            key={
                              day.value
                            }
                            value={
                              day.value
                            }
                          >
                            {
                              day.label
                            }
                          </option>
                        )
                      )}
                    </select>
                  </div>


                  <div className="calendar-field">
                    <label htmlFor="availability-start">
                      Start
                    </label>

                    <input
                      id="availability-start"
                      type="time"
                      value={
                        ruleForm.start_time
                      }
                      onChange={
                        (event) =>
                          setRuleForm(
                            (current) => ({
                              ...current,

                              start_time:
                                event.target.value,
                            })
                          )
                      }
                      required
                    />
                  </div>


                  <div className="calendar-field">
                    <label htmlFor="availability-end">
                      End
                    </label>

                    <input
                      id="availability-end"
                      type="time"
                      value={
                        ruleForm.end_time
                      }
                      onChange={
                        (event) =>
                          setRuleForm(
                            (current) => ({
                              ...current,

                              end_time:
                                event.target.value,
                            })
                          )
                      }
                      required
                    />
                  </div>

                </div>


                <button
                  type="submit"
                  className="calendar-primary-button calendar-form-button"
                  disabled={
                    savingRule
                  }
                >
                  <BiPlus
                    aria-hidden="true"
                  />

                  {savingRule
                    ? "Adding..."
                    : "Add Rule"}
                </button>

              </form>

            </div>


            {/* Exceptions */}

            <div className="calendar-manager-card">

              <div className="calendar-manager-card-heading">

                <div>
                  <h3>
                    Date Exceptions
                  </h3>

                  <p>
                    Override your normal availability
                    for a particular date.
                  </p>
                </div>

              </div>


              <div className="calendar-exception-list">

                {availabilityExceptions.length ===
                0 ? (
                  <div className="calendar-manager-empty">
                    No availability exceptions exist
                    for this calendar period.
                  </div>
                ) : (
                  availabilityExceptions.map(
                    (exception) => (
                      <div
                        key={
                          exception.exception_id
                        }
                        className="calendar-exception-item"
                      >

                        <div className="calendar-exception-main">

                          <span
                            className={
                              exception.is_available
                                ? "calendar-availability-badge calendar-availability-badge--available"
                                : "calendar-availability-badge calendar-availability-badge--unavailable"
                            }
                          >
                            {exception.is_available
                              ? "Available"
                              : "Unavailable"}
                          </span>


                          <strong>
                            {formatShortDate(
                              exception.exception_date
                            )}
                          </strong>


                          <p>
                            {exception.start_time &&
                            exception.end_time
                              ? `${formatShortTime(
                                  exception.start_time
                                )} – ${formatShortTime(
                                  exception.end_time
                                )}`
                              : "All day"}
                          </p>


                          {exception.reason && (
                            <small>
                              {
                                exception.reason
                              }
                            </small>
                          )}

                        </div>


                        <button
                          type="button"
                          className="calendar-delete-button"
                          onClick={() =>
                            handleDeleteException(
                              exception.exception_id
                            )
                          }
                          aria-label="Delete availability exception"
                          title="Delete exception"
                        >
                          <BiTrash
                            aria-hidden="true"
                          />
                        </button>

                      </div>
                    )
                  )
                )}

              </div>


              <form
                className="calendar-manager-form"
                onSubmit={
                  handleCreateException
                }
              >

                <div className="calendar-form-heading">
                  <BiPlus
                    aria-hidden="true"
                  />

                  <strong>
                    Add exception
                  </strong>
                </div>


                <div className="calendar-form-grid">

                  <div className="calendar-field calendar-field--full">
                    <label htmlFor="exception-date">
                      Date
                    </label>

                    <input
                      id="exception-date"
                      type="date"
                      value={
                        exceptionForm.exception_date
                      }
                      onChange={
                        (event) =>
                          setExceptionForm(
                            (current) => ({
                              ...current,

                              exception_date:
                                event.target.value,
                            })
                          )
                      }
                      required
                    />
                  </div>


                  <div className="calendar-field calendar-field--full">
                    <label>
                      Availability
                    </label>

                    <div className="calendar-choice-row">

                      <button
                        type="button"
                        className={
                          !exceptionForm.is_available
                            ? "calendar-choice-button is-active"
                            : "calendar-choice-button"
                        }
                        onClick={() =>
                          setExceptionForm(
                            (current) => ({
                              ...current,

                              is_available:
                                false,
                            })
                          )
                        }
                      >
                        <BiXCircle
                          aria-hidden="true"
                        />

                        Unavailable
                      </button>


                      <button
                        type="button"
                        className={
                          exceptionForm.is_available
                            ? "calendar-choice-button is-active"
                            : "calendar-choice-button"
                        }
                        onClick={() =>
                          setExceptionForm(
                            (current) => ({
                              ...current,

                              is_available:
                                true,
                            })
                          )
                        }
                      >
                        <BiCheckCircle
                          aria-hidden="true"
                        />

                        Available
                      </button>

                    </div>
                  </div>


                  <div className="calendar-field calendar-field--full">

                    <label className="calendar-checkbox-label">

                      <input
                        type="checkbox"
                        checked={
                          exceptionForm.full_day
                        }
                        onChange={
                          (event) =>
                            setExceptionForm(
                              (current) => ({
                                ...current,

                                full_day:
                                  event.target.checked,
                              })
                            )
                        }
                      />

                      <span>
                        All day
                      </span>

                    </label>

                  </div>


                  {!exceptionForm.full_day && (
                    <>
                      <div className="calendar-field">
                        <label htmlFor="exception-start">
                          Start
                        </label>

                        <input
                          id="exception-start"
                          type="time"
                          value={
                            exceptionForm.start_time
                          }
                          onChange={
                            (event) =>
                              setExceptionForm(
                                (current) => ({
                                  ...current,

                                  start_time:
                                    event.target.value,
                                })
                              )
                          }
                          required
                        />
                      </div>


                      <div className="calendar-field">
                        <label htmlFor="exception-end">
                          End
                        </label>

                        <input
                          id="exception-end"
                          type="time"
                          value={
                            exceptionForm.end_time
                          }
                          onChange={
                            (event) =>
                              setExceptionForm(
                                (current) => ({
                                  ...current,

                                  end_time:
                                    event.target.value,
                                })
                              )
                          }
                          required
                        />
                      </div>
                    </>
                  )}


                  <div className="calendar-field calendar-field--full">
                    <label htmlFor="exception-reason">
                      Reason
                    </label>

                    <input
                      id="exception-reason"
                      type="text"
                      value={
                        exceptionForm.reason
                      }
                      onChange={
                        (event) =>
                          setExceptionForm(
                            (current) => ({
                              ...current,

                              reason:
                                event.target.value,
                            })
                          )
                      }
                      placeholder="Holiday, appointment, special hours..."
                    />
                  </div>

                </div>


                <button
                  type="submit"
                  className="calendar-primary-button calendar-form-button"
                  disabled={
                    savingException
                  }
                >
                  <BiPlus
                    aria-hidden="true"
                  />

                  {savingException
                    ? "Adding..."
                    : "Add Exception"}
                </button>

              </form>

            </div>

          </div>

        </section>
      )}


      {/* =====================================================
          Summary
          ===================================================== */}

      <section className="calendar-summary">

        <div className="calendar-summary-card">
          <span>
            This month
          </span>

          <strong>
            {monthBookings.length}
          </strong>

          <small>
            Total bookings
          </small>
        </div>


        <div className="calendar-summary-card">
          <span>
            Confirmed
          </span>

          <strong>
            {monthConfirmed}
          </strong>

          <small>
            Confirmed sessions
          </small>
        </div>


        <div className="calendar-summary-card">
          <span>
            Pending
          </span>

          <strong>
            {monthPending}
          </strong>

          <small>
            Awaiting confirmation
          </small>
        </div>

      </section>


      {/* =====================================================
          Toolbar
          ===================================================== */}

      <section className="calendar-toolbar">

        <div className="calendar-month-navigation">

          <button
            type="button"
            className="calendar-icon-button"
            onClick={
              goPreviousMonth
            }
            aria-label="Previous month"
          >
            <BiChevronLeft />
          </button>


          <div className="calendar-current-month">

            <BiCalendar />

            <h2>
              {formatMonthHeading(
                currentMonth
              )}
            </h2>

          </div>


          <button
            type="button"
            className="calendar-icon-button"
            onClick={
              goNextMonth
            }
            aria-label="Next month"
          >
            <BiChevronRight />
          </button>


          <button
            type="button"
            className="calendar-today-button"
            onClick={
              goToday
            }
          >
            Today
          </button>

        </div>


        <div className="calendar-filter">

          <BiFilterAlt />

          <select
            value={
              statusFilter
            }
            onChange={
              (event) =>
                setStatusFilter(
                  event.target.value
                )
            }
          >
            {STATUS_OPTIONS.map(
              (option) => (
                <option
                  key={
                    option.value
                  }
                  value={
                    option.value
                  }
                >
                  {option.label}
                </option>
              )
            )}
          </select>

        </div>

      </section>


      {/* =====================================================
          Legend
          ===================================================== */}

      <section className="calendar-legend">

        <div>
          <span className="calendar-legend-dot calendar-legend-dot--available" />
          Available
        </div>

        <div>
          <span className="calendar-legend-dot calendar-legend-dot--special" />
          Availability exception
        </div>

        <div>
          <span className="calendar-legend-dot calendar-legend-dot--unavailable" />
          Unavailable
        </div>

        <div>
          <span className="calendar-legend-dot calendar-legend-dot--booking" />
          Booking
        </div>

      </section>


      {error && (
        <div className="calendar-error">
          {error}
        </div>
      )}


      {/* =====================================================
          Calendar
          ===================================================== */}

      <section className="calendar-content">

        <div className="calendar-month-card">

          <div className="calendar-weekdays">

            {WEEKDAY_LABELS.map(
              (day) => (
                <div
                  key={day}
                  className="calendar-weekday"
                >
                  {day}
                </div>
              )
            )}

          </div>


          <div className="calendar-grid">

            {calendarDays.map(
              (date) => {
                const dateKey =
                  formatDateKey(date);

                const dayBookings =
                  bookingsByDate.get(
                    dateKey
                  ) || [];

                const availabilityState =
                  getAvailabilityState(
                    date
                  );

                const isCurrentMonth =
                  date.getMonth() ===
                    currentMonth.getMonth() &&
                  date.getFullYear() ===
                    currentMonth.getFullYear();

                const isToday =
                  dateKey ===
                  todayKey;

                const isSelected =
                  dateKey ===
                  selectedDate;


                return (
                  <button
                    key={
                      dateKey
                    }
                    type="button"
                    className={[
                      "calendar-day",

                      `calendar-day--${availabilityState}`,

                      !isCurrentMonth
                        ? "calendar-day--outside"
                        : "",

                      isToday
                        ? "calendar-day--today"
                        : "",

                      isSelected
                        ? "calendar-day--selected"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() =>
                      handleSelectDay(
                        date
                      )
                    }
                  >

                    <div className="calendar-day-number-row">

                      <span className="calendar-day-number">
                        {date.getDate()}
                      </span>


                      {dayBookings.length >
                        0 && (
                        <span className="calendar-day-count">
                          {
                            dayBookings.length
                          }
                        </span>
                      )}

                    </div>


                    <div className="calendar-day-availability">

                      {availabilityState ===
                        "available" && (
                        <span className="calendar-availability-indicator calendar-availability-indicator--available">
                          Available
                        </span>
                      )}


                      {availabilityState ===
                        "special-available" && (
                        <span className="calendar-availability-indicator calendar-availability-indicator--special">
                          Special hours
                        </span>
                      )}


                      {availabilityState ===
                        "partial-exception" && (
                        <span className="calendar-availability-indicator calendar-availability-indicator--special">
                          Exception
                        </span>
                      )}


                      {availabilityState ===
                        "unavailable" && (
                        <span className="calendar-availability-indicator calendar-availability-indicator--unavailable">
                          Unavailable
                        </span>
                      )}

                    </div>


                    <div className="calendar-day-events">

                      {dayBookings
                        .slice(0, 3)
                        .map(
                          (booking) => (
                            <div
                              key={
                                booking.booking_id
                              }
                              className={`calendar-event calendar-event--${booking.status}`}
                            >

                              <span className="calendar-event-time">
                                {formatShortTime(
                                  booking.start_time
                                )}
                              </span>

                              <span className="calendar-event-name">
                                {booking.service
                                  ?.name ||
                                  "Booking"}
                              </span>

                            </div>
                          )
                        )}


                      {dayBookings.length >
                        3 && (
                        <div className="calendar-more-events">
                          +
                          {dayBookings.length -
                            3}{" "}
                          more
                        </div>
                      )}

                    </div>

                  </button>
                );
              }
            )}

          </div>

        </div>


        {/* ===================================================
            Day agenda
            =================================================== */}

        <aside className="calendar-agenda">

          <div className="calendar-agenda-header">

            <span>
              Selected day
            </span>

            <h2>
              {formatLongDate(
                selectedDate
              )}
            </h2>

            <p>
              {selectedBookings.length ===
              1
                ? "1 booking"
                : `${selectedBookings.length} bookings`}
            </p>

          </div>


          {/* Availability */}

          <div className="calendar-selected-availability">

            <div className="calendar-selected-section-heading">

              <BiTimeFive />

              <span>
                Availability
              </span>

            </div>


            {selectedRules.length ===
              0 &&
            selectedExceptions.length ===
              0 ? (
              <p className="calendar-no-availability">
                No availability has been configured
                for this day.
              </p>
            ) : (
              <>
                {selectedRules.map(
                  (rule) => (
                    <div
                      key={
                        rule.availability_rule_id
                      }
                      className="calendar-selected-availability-row"
                    >

                      <span
                        className={
                          rule.is_available
                            ? "calendar-availability-badge calendar-availability-badge--available"
                            : "calendar-availability-badge calendar-availability-badge--unavailable"
                        }
                      >
                        {rule.is_available
                          ? "Available"
                          : "Unavailable"}
                      </span>

                      <p>
                        {formatShortTime(
                          rule.start_time
                        )}
                        {" – "}
                        {formatShortTime(
                          rule.end_time
                        )}
                      </p>

                    </div>
                  )
                )}


                {selectedExceptions.map(
                  (exception) => (
                    <div
                      key={
                        exception.exception_id
                      }
                      className="calendar-selected-exception"
                    >

                      <span
                        className={
                          exception.is_available
                            ? "calendar-availability-badge calendar-availability-badge--available"
                            : "calendar-availability-badge calendar-availability-badge--unavailable"
                        }
                      >
                        Exception
                      </span>


                      <div>
                        <strong>
                          {exception.is_available
                            ? "Available"
                            : "Unavailable"}
                        </strong>

                        <p>
                          {exception.start_time &&
                          exception.end_time
                            ? `${formatShortTime(
                                exception.start_time
                              )} – ${formatShortTime(
                                exception.end_time
                              )}`
                            : "All day"}
                        </p>

                        {exception.reason && (
                          <small>
                            {
                              exception.reason
                            }
                          </small>
                        )}
                      </div>

                    </div>
                  )
                )}
              </>
            )}

          </div>


          {/* Bookings */}

          <div className="calendar-agenda-list">

            <div className="calendar-selected-section-heading">
              <BiCalendar />

              <span>
                Bookings
              </span>
            </div>


            {selectedBookings.length ===
            0 ? (
              <div className="calendar-empty-day">

                <BiCalendar />

                <h3>
                  No bookings
                </h3>

                <p>
                  There are no bookings scheduled
                  for this day.
                </p>

              </div>
            ) : (
              selectedBookings.map(
                (booking) => (
                  <article
                    key={
                      booking.booking_id
                    }
                    className="calendar-agenda-booking"
                  >

                    <div className="calendar-agenda-booking-top">

                      <div>
                        <span
                          className={`calendar-status calendar-status--${booking.status}`}
                        >
                          {
                            booking.status
                          }
                        </span>

                        <h3>
                          {booking.service
                            ?.name ||
                            "Photography booking"}
                        </h3>
                      </div>


                      <strong className="calendar-booking-price">
                        {formatCurrency(
                          booking.total_amount
                        )}
                      </strong>

                    </div>


                    <div className="calendar-booking-details">

                      <div>
                        <BiTimeFive />

                        <span>
                          {formatShortTime(
                            booking.start_time
                          )}
                          {" – "}
                          {formatShortTime(
                            booking.end_time
                          )}
                        </span>
                      </div>


                      <div>
                        <BiUser />

                        <span>
                          {getClientName(
                            booking
                          )}
                        </span>
                      </div>


                      {booking.location && (
                        <div>
                          <BiMap />

                          <span>
                            {
                              booking.location
                            }
                          </span>
                        </div>
                      )}

                    </div>


                    {booking.notes && (
                      <div className="calendar-booking-notes">

                        <span>
                          Notes
                        </span>

                        <p>
                          {
                            booking.notes
                          }
                        </p>

                      </div>
                    )}

                  </article>
                )
              )
            )}

          </div>

        </aside>

      </section>

    </div>
  );
}