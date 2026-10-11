import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  BiCheck,
  BiCheckDouble,
  BiConversation,
  BiMessageAdd,
  BiRefresh,
  BiSend,
} from "react-icons/bi";

import { supabase } from "../../lib/supabaseClient"; // Auth/Reatime subscription only
import {
  apiGetClientMessages,
  apiCreateClientConversation,
  apiSendClientMessage,
  apiMarkClientMessagesRead,
} from "../../services/clientMessagesApi";

import "./Messages.css";


const MAX_MESSAGE_LENGTH = 5000;


export default function Messages() {
  const [currentUserId, setCurrentUserId] = useState("");
  const [client, setClient] = useState(null);
  const [photographer, setPhotographer] = useState(null);

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);

  const [draft, setDraft] = useState("");

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creatingConversation, setCreatingConversation] =
    useState(false);

  const [error, setError] = useState("");
  const [messageError, setMessageError] = useState("");

  const threadEndRef = useRef(null);


  /* =========================================================
     Helpers
     ========================================================= */

  function getPhotographerName() {
    if (!photographer) {
      return "Your photographer";
    }

    if (photographer.business_name) {
      return photographer.business_name;
    }

    const firstName =
      photographer.first_name?.trim() || "";

    const lastName =
      photographer.last_name?.trim() || "";

    const fullName =
      `${firstName} ${lastName}`.trim();

    return fullName || "Your photographer";
  }


  function getPhotographerInitials() {
    if (!photographer) {
      return "PH";
    }

    if (photographer.business_name) {
      const words =
        photographer.business_name
          .trim()
          .split(/\s+/)
          .filter(Boolean);

      if (words.length === 1) {
        return words[0]
          .slice(0, 2)
          .toUpperCase();
      }

      return `${words[0][0]}${words[1][0]
        }`.toUpperCase();
    }

    const firstName =
      photographer.first_name?.trim() || "";

    const lastName =
      photographer.last_name?.trim() || "";

    return (
      `${firstName.charAt(0)}${lastName.charAt(0)}`
        .toUpperCase() || "PH"
    );
  }


  function formatMessageDate(value) {
    if (!value) {
      return "";
    }

    return new Date(value).toLocaleString(
      "en-NZ",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  }


  /* =========================================================
     Load messaging data
     ========================================================= */

  const loadMessagingData = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true);
        }

        setError("");
        setMessageError("");

        const response = await apiGetClientMessages();
        const { currentUserId: userId, client: clientData,
          photographer: photographerProfile, conversation: conversationData,
          messages: messageRows } = response.data;

        setCurrentUserId(userId);
        setClient(clientData);
        setPhotographer(photographerProfile);
        setConversation(conversationData);
        setMessages(messageRows || []);

      } catch (loadError) {
        console.error(
          "Client messaging error:",
          loadError
        );

        setError(
          loadError.message ||
          "Unable to load your messages."
        );
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    []
  );


  useEffect(() => {
    loadMessagingData();
  }, [loadMessagingData]);


  /* =========================================================
     Mark incoming messages as read
     ========================================================= */

  const markMessagesRead =
    useCallback(async () => {
      if (
        !conversation?.conversation_id ||
        !currentUserId
      ) {
        return;
      }

      try {
        const response = await apiMarkClientMessagesRead();
        const updatedIds = new Set(response.data.updatedIds || []);
        if (!updatedIds.size) return;
        setMessages((current) => current.map((message) =>
          updatedIds.has(message.message_id) ? { ...message, is_read: true } : message
        ));
      } catch (updateError) {
        console.error("Unable to mark messages as read:", updateError);
      }
    }, [
      conversation?.conversation_id,
      currentUserId,
    ]);


  useEffect(() => {
    markMessagesRead();
  }, [markMessagesRead]);


  /* =========================================================
     Realtime
     ========================================================= */

  useEffect(() => {
    if (
      !conversation?.conversation_id ||
      !currentUserId
    ) {
      return undefined;
    }

    const conversationId =
      conversation.conversation_id;

    const channel = supabase
      .channel(
        `client-conversation-${conversationId}`
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter:
            `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming =
            payload.new;

          setMessages(
            (current) => {
              const exists =
                current.some(
                  (message) =>
                    message.message_id ===
                    incoming.message_id
                );

              if (exists) {
                return current;
              }

              return [
                ...current,
                incoming,
              ];
            }
          );

          if (
            incoming.sender_id !==
            currentUserId
          ) {
            setTimeout(() => {
              markMessagesRead();
            }, 100);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter:
            `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedMessage =
            payload.new;

          setMessages(
            (current) =>
              current.map(
                (message) =>
                  message.message_id ===
                    updatedMessage.message_id
                    ? {
                      ...message,
                      ...updatedMessage,
                    }
                    : message
              )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
        channel
      );
    };
  }, [
    conversation?.conversation_id,
    currentUserId,
    markMessagesRead,
  ]);


  /* =========================================================
     Scroll to latest message
     ========================================================= */

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages.length]);


  /* =========================================================
     Create conversation
     ========================================================= */

  async function createConversation() {
    if (
      !client ||
      !client.photographer_id
    ) {
      return null;
    }

    if (conversation) {
      return conversation;
    }

    setCreatingConversation(true);
    setMessageError("");

    try {
      const response = await apiCreateClientConversation();
      const newConversation = response.data;
      setConversation(newConversation);
      return newConversation;
    } catch (
    conversationError
    ) {
      console.error(
        "Unable to create conversation:",
        conversationError
      );

      setMessageError(
        conversationError.message ||
        "Unable to start the conversation."
      );

      return null;
    } finally {
      setCreatingConversation(false);
    }
  }


  /* =========================================================
     Send message
     ========================================================= */

  async function handleSendMessage(
    event
  ) {
    event?.preventDefault();

    const cleanMessage =
      draft.trim();

    if (
      !cleanMessage ||
      !currentUserId ||
      sending
    ) {
      return;
    }

    if (
      cleanMessage.length >
      MAX_MESSAGE_LENGTH
    ) {
      setMessageError(
        `Messages can be up to ${MAX_MESSAGE_LENGTH.toLocaleString()} characters.`
      );

      return;
    }

    setSending(true);
    setMessageError("");

    try {
      let activeConversation =
        conversation;

      if (!activeConversation) {
        activeConversation =
          await createConversation();

        if (!activeConversation) {
          return;
        }
      }

      const response = await apiSendClientMessage(cleanMessage);
      const createdMessage = response.data;

      setDraft("");

      setMessages(
        (current) => {
          const exists =
            current.some(
              (message) =>
                message.message_id ===
                createdMessage.message_id
            );

          if (exists) {
            return current;
          }

          return [
            ...current,
            createdMessage,
          ];
        }
      );
    } catch (sendError) {
      console.error(
        "Unable to send message:",
        sendError
      );

      setMessageError(
        sendError.message ||
        "Your message could not be sent."
      );
    } finally {
      setSending(false);
    }
  }


  function handleComposerKeyDown(
    event
  ) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      handleSendMessage(event);
    }
  }


  /* =========================================================
     Loading
     ========================================================= */

  if (loading) {
    return (
      <div className="client-messages-page">
        <div className="client-messages-loading">
          <span className="client-messages-spinner" />

          <p>
            Loading your messages...
          </p>
        </div>
      </div>
    );
  }


  /* =========================================================
     Error
     ========================================================= */

  if (error) {
    return (
      <div className="client-messages-page">
        <div className="client-messages-error">
          <BiConversation
            aria-hidden="true"
          />

          <h2>
            Unable to load messages
          </h2>

          <p>
            {error}
          </p>

          <button
            type="button"
            onClick={() =>
              loadMessagingData()
            }
          >
            <BiRefresh
              aria-hidden="true"
            />

            Try again
          </button>
        </div>
      </div>
    );
  }


  /* =========================================================
     Page
     ========================================================= */

  return (
    <div className="client-messages-page">

      {/* =====================================================
          Header
          ===================================================== */}

      <section className="client-messages-welcome">

        <span className="client-messages-eyebrow">
          Communication
        </span>

        <h1>
          Messages
        </h1>

        <p>
          Keep in touch with your
          photographer about your bookings,
          galleries and photography sessions.
        </p>

      </section>


      {/* =====================================================
          Conversation
          ===================================================== */}

      <section className="client-messages-card">

        {/* ===================================================
            Photographer header
            =================================================== */}

        <header className="client-messages-thread-header">

          <div className="client-messages-avatar">
            {getPhotographerInitials()}
          </div>

          <div className="client-messages-photographer">
            <span>
              Your photographer
            </span>

            <h2>
              {getPhotographerName()}
            </h2>
          </div>

        </header>


        {/* ===================================================
            Thread history
            =================================================== */}

        <div className="client-messages-history">

          {!messages.length ? (
            <div className="client-messages-empty">

              <div className="client-messages-empty-icon">
                <BiMessageAdd
                  aria-hidden="true"
                />
              </div>

              <h3>
                Start a conversation
              </h3>

              <p>
                Send a message to{" "}
                {getPhotographerName()} if
                you have a question about
                your booking, gallery or
                photography session.
              </p>

            </div>
          ) : (
            messages.map(
              (
                message,
                index
              ) => {
                const isMine =
                  message.sender_id ===
                  currentUserId;

                const previousMessage =
                  messages[index - 1];

                const previousIsMine =
                  previousMessage
                    ?.sender_id ===
                  currentUserId;

                const startOfGroup =
                  !previousMessage ||
                  previousIsMine !==
                  isMine;

                return (
                  <div
                    key={
                      message.message_id
                    }
                    className={`client-message-row ${isMine
                      ? "client-message-row--mine"
                      : "client-message-row--theirs"
                      } ${startOfGroup
                        ? "client-message-row--group-start"
                        : ""
                      }`}
                  >
                    <div className="client-message-bubble">

                      <p>
                        {
                          message.message
                        }
                      </p>

                      <div className="client-message-meta">

                        <time>
                          {formatMessageDate(
                            message.created_at
                          )}
                        </time>

                        {isMine && (
                          <span
                            className={`client-message-read ${message.is_read
                              ? "is-read"
                              : ""
                              }`}
                            title={
                              message.is_read
                                ? "Read"
                                : "Sent"
                            }
                          >
                            {message.is_read ? (
                              <>
                                <BiCheckDouble
                                  aria-hidden="true"
                                />

                                Read
                              </>
                            ) : (
                              <>
                                <BiCheck
                                  aria-hidden="true"
                                />

                                Sent
                              </>
                            )}
                          </span>
                        )}

                      </div>

                    </div>
                  </div>
                );
              }
            )
          )}

          <div
            ref={threadEndRef}
          />

        </div>


        {/* ===================================================
            Composer
            =================================================== */}

        <form
          className="client-messages-composer"
          onSubmit={
            handleSendMessage
          }
        >

          {messageError && (
            <div className="client-messages-composer-error">
              {messageError}
            </div>
          )}

          <div className="client-messages-composer-row">

            <textarea
              rows="1"
              value={draft}
              maxLength={
                MAX_MESSAGE_LENGTH
              }
              placeholder={`Message ${getPhotographerName()}...`}
              aria-label="Write a message"
              onChange={(event) =>
                setDraft(
                  event.target.value
                )
              }
              onKeyDown={
                handleComposerKeyDown
              }
            />

            <button
              type="submit"
              className="client-messages-send"
              disabled={
                sending ||
                creatingConversation ||
                !draft.trim()
              }
            >
              <BiSend
                aria-hidden="true"
              />

              <span>
                {sending ||
                  creatingConversation
                  ? "Sending..."
                  : "Send"}
              </span>
            </button>

          </div>


          <div className="client-messages-composer-footer">

            <span>
              Enter to send · Shift +
              Enter for a new line
            </span>

            <span>
              {draft.length.toLocaleString()}
              {" / "}
              {MAX_MESSAGE_LENGTH.toLocaleString()}
            </span>

          </div>

        </form>

      </section>

    </div>
  );
}