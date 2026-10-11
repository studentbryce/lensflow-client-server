import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";

import {
    BiArrowBack,
    BiCheck,
    BiCheckDouble,
    BiConversation,
    BiMessageAdd,
    BiRefresh,
    BiSearch,
    BiSend,
    BiUser,
    BiX,
} from "react-icons/bi";

import { supabase } from "../../lib/supabaseClient";
import { apiGetPhotographerMessages, apiStartPhotographerConversation,
    apiSendPhotographerMessage, apiMarkPhotographerMessagesRead } from "../../services/photographerMessagesApi";

import "./Messages.css";


const MAX_MESSAGE_LENGTH = 5000;


export default function Messages() {
    const [currentUserId, setCurrentUserId] = useState("");
    const [photographerId, setPhotographerId] = useState("");

    const [clients, setClients] = useState([]);
    const [conversations, setConversations] = useState([]);

    const [selectedConversationId, setSelectedConversationId] =
        useState("");

    const [searchTerm, setSearchTerm] = useState("");
    const [draft, setDraft] = useState("");

    const [composeOpen, setComposeOpen] = useState(false);
    const [composeSearch, setComposeSearch] = useState("");

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [creatingConversation, setCreatingConversation] =
        useState(false);

    const [error, setError] = useState("");
    const [messageError, setMessageError] = useState("");

    const threadEndRef = useRef(null);


    /* =========================================================
       Formatting helpers
       ========================================================= */

    function getClientName(client) {
        const firstName =
            client?.first_name?.trim() || "";

        const lastName =
            client?.last_name?.trim() || "";

        const fullName =
            `${firstName} ${lastName}`.trim();

        return (
            fullName ||
            client?.email ||
            "Photography Client"
        );
    }


    function getInitials(client) {
        const firstName =
            client?.first_name?.trim() || "";

        const lastName =
            client?.last_name?.trim() || "";

        if (firstName || lastName) {
            return `${firstName.charAt(0)}${lastName.charAt(0)}`
                .toUpperCase();
        }

        return "CL";
    }


    function formatConversationDate(value) {
        if (!value) {
            return "";
        }

        const date = new Date(value);
        const now = new Date();

        const isToday =
            date.toDateString() ===
            now.toDateString();

        if (isToday) {
            return date.toLocaleTimeString(
                "en-NZ",
                {
                    hour: "2-digit",
                    minute: "2-digit",
                }
            );
        }

        const yesterday = new Date(now);

        yesterday.setDate(
            yesterday.getDate() - 1
        );

        if (
            date.toDateString() ===
            yesterday.toDateString()
        ) {
            return "Yesterday";
        }

        const sameYear =
            date.getFullYear() ===
            now.getFullYear();

        return date.toLocaleDateString(
            "en-NZ",
            sameYear
                ? {
                    day: "2-digit",
                    month: "short",
                }
                : {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                }
        );
    }


    function formatMessageDate(value) {
        if (!value) {
            return "";
        }

        return new Date(value)
            .toLocaleString(
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

    const loadMessagingData = useCallback(async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            setError("");
            const response = await apiGetPhotographerMessages();
            const data = response.data;
            setCurrentUserId(data.currentUserId);
            setPhotographerId(data.photographerId);
            setClients(data.clients || []);
            setConversations(data.conversations || []);
            setSelectedConversationId(current =>
                current && (data.conversations || []).some(c => c.conversation_id === current)
                    ? current : ""
            );
        } catch (loadError) {
            console.error("Photographer messaging error:", loadError);
            setError(loadError.message || "Unable to load your messages.");
        } finally {
            if (showLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMessagingData();
    }, [loadMessagingData]);


    /* =========================================================
       Selected conversation
       ========================================================= */

    const selectedConversation =
        useMemo(
            () =>
                conversations.find(
                    (conversation) =>
                        conversation.conversation_id ===
                        selectedConversationId
                ) || null,
            [
                conversations,
                selectedConversationId,
            ]
        );


    /* =========================================================
       Search conversations
       ========================================================= */

    const filteredConversations =
        useMemo(() => {
            const query =
                searchTerm
                    .trim()
                    .toLowerCase();

            if (!query) {
                return conversations;
            }

            return conversations.filter(
                (conversation) => {
                    const clientName =
                        getClientName(
                            conversation.client
                        )
                            .toLowerCase();

                    const email =
                        conversation.client
                            ?.email
                            ?.toLowerCase() ||
                        "";

                    const lastMessage =
                        conversation.lastMessage
                            ?.message
                            ?.toLowerCase() ||
                        "";

                    return (
                        clientName.includes(
                            query
                        ) ||
                        email.includes(query) ||
                        lastMessage.includes(
                            query
                        )
                    );
                }
            );
        }, [
            conversations,
            searchTerm,
        ]);


    /* =========================================================
       Search clients when starting conversation
       ========================================================= */

    const filteredClients =
        useMemo(() => {
            const query =
                composeSearch
                    .trim()
                    .toLowerCase();

            if (!query) {
                return clients;
            }

            return clients.filter(
                (client) =>
                    getClientName(client)
                        .toLowerCase()
                        .includes(query) ||
                    client.email
                        ?.toLowerCase()
                        .includes(query)
            );
        }, [
            clients,
            composeSearch,
        ]);


    /* =========================================================
       Read state
       ========================================================= */

    const markConversationRead =
        useCallback(
            async (
                conversationId
            ) => {
                if (
                    !conversationId ||
                    !currentUserId
                ) {
                    return;
                }

                const unreadMessages =
                    conversations
                        .find(
                            (conversation) =>
                                conversation.conversation_id ===
                                conversationId
                        )
                        ?.messages.filter(
                            (message) =>
                                !message.is_read &&
                                message.sender_id !==
                                currentUserId
                        ) || [];

                if (
                    !unreadMessages.length
                ) {
                    return;
                }

                try {
                    await apiMarkPhotographerMessagesRead(conversationId);
                } catch (updateError) {
                    console.error("Unable to mark messages as read:", updateError);
                    return;
                }

                setConversations(
                    (current) =>
                        current.map(
                            (conversation) => {
                                if (
                                    conversation.conversation_id !==
                                    conversationId
                                ) {
                                    return conversation;
                                }

                                const messages =
                                    conversation.messages.map(
                                        (message) =>
                                            message.sender_id !==
                                                currentUserId &&
                                                !message.is_read
                                                ? {
                                                    ...message,
                                                    is_read:
                                                        true,
                                                }
                                                : message
                                    );

                                return {
                                    ...conversation,
                                    messages,
                                    unreadCount: 0,
                                    lastMessage:
                                        messages.length
                                            ? messages[
                                            messages.length -
                                            1
                                            ]
                                            : null,
                                };
                            }
                        )
                );
            },
            [
                conversations,
                currentUserId,
            ]
        );


    useEffect(() => {
        if (
            selectedConversationId
        ) {
            markConversationRead(
                selectedConversationId
            );
        }
    }, [
        selectedConversationId,
        markConversationRead,
    ]);


    /* =========================================================
       Scroll to newest message
       ========================================================= */

    useEffect(() => {
        if (
            !selectedConversation
        ) {
            return;
        }

        threadEndRef.current?.scrollIntoView(
            {
                behavior: "smooth",
            }
        );
    }, [
        selectedConversation?.messages
            ?.length,
    ]);


    /* =========================================================
       Realtime messages
       ========================================================= */

    useEffect(() => {
        if (
            !photographerId ||
            !currentUserId
        ) {
            return undefined;
        }

        let refreshingUnknownConversation =
            false;

        const channel = supabase
            .channel(
                `photographer-messages-${photographerId}`
            )
            .on(
                "postgres_changes",
                {
                    event: "INSERT",
                    schema: "public",
                    table: "messages",
                },
                async (payload) => {
                    const incoming =
                        payload.new;

                    let knownConversation =
                        false;

                    setConversations(
                        (current) => {
                            knownConversation =
                                current.some(
                                    (conversation) =>
                                        conversation.conversation_id ===
                                        incoming.conversation_id
                                );

                            if (
                                !knownConversation
                            ) {
                                return current;
                            }

                            const updated =
                                current.map(
                                    (conversation) => {
                                        if (
                                            conversation.conversation_id !==
                                            incoming.conversation_id
                                        ) {
                                            return conversation;
                                        }

                                        const alreadyExists =
                                            conversation.messages.some(
                                                (message) =>
                                                    message.message_id ===
                                                    incoming.message_id
                                            );

                                        const messages =
                                            alreadyExists
                                                ? conversation.messages
                                                : [
                                                    ...conversation.messages,
                                                    incoming,
                                                ];

                                        const unreadCount =
                                            messages.filter(
                                                (message) =>
                                                    !message.is_read &&
                                                    message.sender_id !==
                                                    currentUserId
                                            ).length;

                                        return {
                                            ...conversation,

                                            messages,

                                            lastMessage:
                                                messages[
                                                messages.length -
                                                1
                                                ],

                                            unreadCount,

                                            updated_at:
                                                incoming.created_at,
                                        };
                                    }
                                );

                            return updated.sort(
                                (a, b) =>
                                    new Date(
                                        b.updated_at ||
                                        b.created_at
                                    ) -
                                    new Date(
                                        a.updated_at ||
                                        a.created_at
                                    )
                            );
                        }
                    );

                    if (
                        !knownConversation &&
                        !refreshingUnknownConversation
                    ) {
                        refreshingUnknownConversation =
                            true;

                        await loadMessagingData(
                            false
                        );

                        refreshingUnknownConversation =
                            false;

                        return;
                    }

                    if (
                        incoming.conversation_id ===
                        selectedConversationId &&
                        incoming.sender_id !==
                        currentUserId
                    ) {
                        setTimeout(
                            () =>
                                markConversationRead(
                                    incoming.conversation_id
                                ),
                            50
                        );
                    }
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "messages",
                },
                (payload) => {
                    const updatedMessage =
                        payload.new;

                    setConversations(
                        (current) =>
                            current.map(
                                (conversation) => {
                                    if (
                                        conversation.conversation_id !==
                                        updatedMessage.conversation_id
                                    ) {
                                        return conversation;
                                    }

                                    const messages =
                                        conversation.messages.map(
                                            (message) =>
                                                message.message_id ===
                                                    updatedMessage.message_id
                                                    ? {
                                                        ...message,
                                                        ...updatedMessage,
                                                    }
                                                    : message
                                        );

                                    return {
                                        ...conversation,
                                        messages,

                                        unreadCount:
                                            messages.filter(
                                                (message) =>
                                                    !message.is_read &&
                                                    message.sender_id !==
                                                    currentUserId
                                            ).length,

                                        lastMessage:
                                            messages.length
                                                ? messages[
                                                messages.length -
                                                1
                                                ]
                                                : null,
                                    };
                                }
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
        photographerId,
        currentUserId,
        selectedConversationId,
        loadMessagingData,
        markConversationRead,
    ]);


    /* =========================================================
       Start conversation
       ========================================================= */

    async function handleStartConversation(
        client
    ) {
        if (
            !client ||
            !photographerId
        ) {
            return;
        }

        setCreatingConversation(
            true
        );

        setMessageError("");

        try {
            const existingConversation =
                conversations.find(
                    (conversation) =>
                        conversation.client_id ===
                        client.client_id
                );

            if (
                existingConversation
            ) {
                setSelectedConversationId(
                    existingConversation.conversation_id
                );

                setComposeOpen(false);
                setComposeSearch("");

                return;
            }

            const { data: newConversation } = await apiStartPhotographerConversation(client.client_id);

            const builtConversation = {
                ...newConversation,
                client,
                messages: [],
                lastMessage: null,
                unreadCount: 0,
            };

            setConversations(current => current.some(c => c.conversation_id === newConversation.conversation_id)
                ? current : [builtConversation, ...current]);

            setSelectedConversationId(
                newConversation.conversation_id
            );

            setComposeOpen(false);
            setComposeSearch("");
        } catch (
        conversationError
        ) {
            console.error(
                "Unable to create conversation:",
                conversationError
            );

            /*
             * A duplicate conversation may have
             * been created by the client at the
             * same moment.
             */


            setMessageError(
                conversationError.message ||
                "Unable to start this conversation."
            );
        } finally {
            setCreatingConversation(
                false
            );
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
            !selectedConversation ||
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
            const { data: createdMessage } = await apiSendPhotographerMessage(
                selectedConversation.conversation_id, cleanMessage
            );

            setDraft("");

            /*
             * Add immediately so sending feels
             * instant. Realtime dedupes it using
             * message_id if the event arrives too.
             */

            setConversations(
                (current) => {
                    const updated =
                        current.map(
                            (conversation) => {
                                if (
                                    conversation.conversation_id !==
                                    createdMessage.conversation_id
                                ) {
                                    return conversation;
                                }

                                const alreadyExists =
                                    conversation.messages.some(
                                        (message) =>
                                            message.message_id ===
                                            createdMessage.message_id
                                    );

                                const messages =
                                    alreadyExists
                                        ? conversation.messages
                                        : [
                                            ...conversation.messages,
                                            createdMessage,
                                        ];

                                return {
                                    ...conversation,

                                    messages,

                                    lastMessage:
                                        createdMessage,

                                    updated_at:
                                        createdMessage.created_at,
                                };
                            }
                        );

                    return updated.sort(
                        (a, b) =>
                            new Date(
                                b.updated_at ||
                                b.created_at
                            ) -
                            new Date(
                                a.updated_at ||
                                a.created_at
                            )
                    );
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

            handleSendMessage(
                event
            );
        }
    }


    /* =========================================================
       Loading
       ========================================================= */

    if (loading) {
        return (
            <div className="messages-page">
                <div className="messages-loading">
                    <span className="messages-spinner" />

                    <p>
                        Loading messages...
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
            <div className="messages-page">
                <div className="messages-error-state">
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
        <div className="messages-page">

            {/* =====================================================
          Header
          ===================================================== */}

            <header className="messages-page-header">
                <div>
                    <span className="messages-eyebrow">
                        Communication
                    </span>

                    <h1>
                        Messages
                    </h1>

                    <p>
                        Keep in touch with your
                        photography clients.
                    </p>
                </div>

                <button
                    type="button"
                    className="messages-new-button"
                    onClick={() => {
                        setComposeOpen(true);
                        setComposeSearch("");
                    }}
                >
                    <BiMessageAdd
                        aria-hidden="true"
                    />

                    New message
                </button>
            </header>


            {/* =====================================================
          Messaging shell
          ===================================================== */}

            <section
                className={`messages-shell ${selectedConversation
                        ? "messages-shell--thread-open"
                        : ""
                    }`}
            >

                {/* ===================================================
            Conversation list
            =================================================== */}

                <aside className="messages-sidebar">

                    <div className="messages-sidebar-header">
                        <div>
                            <h2>
                                Conversations
                            </h2>

                            <span>
                                {
                                    conversations.length
                                }{" "}
                                {conversations.length ===
                                    1
                                    ? "conversation"
                                    : "conversations"}
                            </span>
                        </div>
                    </div>


                    <div className="messages-search">
                        <BiSearch
                            aria-hidden="true"
                        />

                        <input
                            type="search"
                            value={searchTerm}
                            placeholder="Search messages..."
                            aria-label="Search conversations"
                            onChange={(event) =>
                                setSearchTerm(
                                    event.target.value
                                )
                            }
                        />

                        {searchTerm && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() =>
                                    setSearchTerm("")
                                }
                            >
                                <BiX
                                    aria-hidden="true"
                                />
                            </button>
                        )}
                    </div>


                    <div className="messages-conversation-list">

                        {!filteredConversations
                            .length ? (
                            <div className="messages-list-empty">
                                <BiConversation
                                    aria-hidden="true"
                                />

                                <h3>
                                    {searchTerm
                                        ? "No conversations found"
                                        : "No messages yet"}
                                </h3>

                                <p>
                                    {searchTerm
                                        ? "Try a different search."
                                        : "Start a conversation with one of your clients."}
                                </p>

                                {!searchTerm && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setComposeOpen(
                                                true
                                            )
                                        }
                                    >
                                        New message
                                    </button>
                                )}
                            </div>
                        ) : (
                            filteredConversations.map(
                                (conversation) => {
                                    const isSelected =
                                        conversation.conversation_id ===
                                        selectedConversationId;

                                    return (
                                        <button
                                            type="button"
                                            key={
                                                conversation.conversation_id
                                            }
                                            className={`messages-conversation-item ${isSelected
                                                    ? "is-active"
                                                    : ""
                                                }`}
                                            onClick={() => {
                                                setSelectedConversationId(
                                                    conversation.conversation_id
                                                );

                                                setMessageError(
                                                    ""
                                                );
                                            }}
                                        >
                                            <div className="messages-avatar">
                                                {getInitials(
                                                    conversation.client
                                                )}
                                            </div>

                                            <div className="messages-conversation-info">
                                                <div className="messages-conversation-top">
                                                    <strong>
                                                        {getClientName(
                                                            conversation.client
                                                        )}
                                                    </strong>

                                                    <time>
                                                        {formatConversationDate(
                                                            conversation
                                                                .lastMessage
                                                                ?.created_at ||
                                                            conversation.updated_at
                                                        )}
                                                    </time>
                                                </div>

                                                <div className="messages-conversation-bottom">
                                                    <span className="messages-preview">
                                                        {conversation
                                                            .lastMessage
                                                            ?.sender_id ===
                                                            currentUserId
                                                            ? "You: "
                                                            : ""}

                                                        {conversation
                                                            .lastMessage
                                                            ?.message ||
                                                            "No messages yet"}
                                                    </span>

                                                    {conversation.unreadCount >
                                                        0 && (
                                                            <span className="messages-unread-badge">
                                                                {conversation.unreadCount >
                                                                    99
                                                                    ? "99+"
                                                                    : conversation.unreadCount}
                                                            </span>
                                                        )}
                                                </div>
                                            </div>
                                        </button>
                                    );
                                }
                            )
                        )}
                    </div>
                </aside>


                {/* ===================================================
            Thread
            =================================================== */}

                <div className="messages-thread">

                    {!selectedConversation ? (
                        <div className="messages-thread-empty">
                            <div className="messages-thread-empty-icon">
                                <BiConversation
                                    aria-hidden="true"
                                />
                            </div>

                            <h2>
                                Your conversations
                            </h2>

                            <p>
                                Select a client conversation
                                to view your message history,
                                or start a new conversation.
                            </p>

                            <button
                                type="button"
                                className="messages-new-button"
                                onClick={() =>
                                    setComposeOpen(true)
                                }
                            >
                                <BiMessageAdd
                                    aria-hidden="true"
                                />

                                New message
                            </button>
                        </div>
                    ) : (
                        <>

                            {/* ===============================================
                  Thread header
                  =============================================== */}

                            <header className="messages-thread-header">

                                <button
                                    type="button"
                                    className="messages-mobile-back"
                                    aria-label="Back to conversations"
                                    onClick={() =>
                                        setSelectedConversationId(
                                            ""
                                        )
                                    }
                                >
                                    <BiArrowBack
                                        aria-hidden="true"
                                    />
                                </button>

                                <div className="messages-avatar messages-thread-avatar">
                                    {getInitials(
                                        selectedConversation.client
                                    )}
                                </div>

                                <div className="messages-thread-client">
                                    <h2>
                                        {getClientName(
                                            selectedConversation.client
                                        )}
                                    </h2>

                                    <span>
                                        {selectedConversation
                                            .client?.email ||
                                            "LensFlow client"}
                                    </span>
                                </div>
                            </header>


                            {/* ===============================================
                  Message history
                  =============================================== */}

                            <div className="messages-thread-history">

                                {!selectedConversation
                                    .messages.length ? (
                                    <div className="messages-first-message">
                                        <BiMessageAdd
                                            aria-hidden="true"
                                        />

                                        <h3>
                                            Start the conversation
                                        </h3>

                                        <p>
                                            Send your first message
                                            to{" "}
                                            {getClientName(
                                                selectedConversation.client
                                            )}
                                            .
                                        </p>
                                    </div>
                                ) : (
                                    selectedConversation.messages.map(
                                        (
                                            message,
                                            index
                                        ) => {
                                            const isMine =
                                                message.sender_id ===
                                                currentUserId;

                                            const previousMessage =
                                                selectedConversation
                                                    .messages[
                                                index - 1
                                                ];

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
                                                    className={`messages-message-row ${isMine
                                                            ? "messages-message-row--mine"
                                                            : "messages-message-row--theirs"
                                                        } ${startOfGroup
                                                            ? "messages-message-row--group-start"
                                                            : ""
                                                        }`}
                                                    key={
                                                        message.message_id
                                                    }
                                                >
                                                    <div className="messages-message-bubble">
                                                        <p>
                                                            {
                                                                message.message
                                                            }
                                                        </p>

                                                        <div className="messages-message-meta">
                                                            <time>
                                                                {formatMessageDate(
                                                                    message.created_at
                                                                )}
                                                            </time>

                                                            {isMine && (
                                                                <span
                                                                    className={
                                                                        message.is_read
                                                                            ? "messages-read-state is-read"
                                                                            : "messages-read-state"
                                                                    }
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
                                    ref={
                                        threadEndRef
                                    }
                                />
                            </div>


                            {/* ===============================================
                                Composer
                                =============================================== */}

                            <form
                                className="messages-composer"
                                onSubmit={
                                    handleSendMessage
                                }
                            >
                                {messageError && (
                                    <div className="messages-composer-error">
                                        {messageError}
                                    </div>
                                )}

                                <div className="messages-composer-box">
                                    <textarea
                                        id="client-message"
                                        name="client-message"
                                        rows="1"
                                        value={draft}
                                        maxLength={
                                            MAX_MESSAGE_LENGTH
                                        }
                                        placeholder={`Message ${getClientName(
                                            selectedConversation.client
                                        )}...`}
                                        aria-label="Write a message"
                                        onChange={(
                                            event
                                        ) =>
                                            setDraft(
                                                event.target
                                                    .value
                                            )
                                        }
                                        onKeyDown={
                                            handleComposerKeyDown
                                        }
                                    />

                                    <button
                                        type="submit"
                                        className="messages-send-button"
                                        disabled={
                                            sending ||
                                            !draft.trim()
                                        }
                                    >
                                        <BiSend
                                            aria-hidden="true"
                                        />

                                        <span>
                                            {sending
                                                ? "Sending..."
                                                : "Send"}
                                        </span>
                                    </button>
                                </div>

                                <div className="messages-composer-footer">
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
                        </>
                    )}
                </div>
            </section>


            {/* =====================================================
          New conversation modal
          ===================================================== */}

            {composeOpen && (
                <div
                    className="messages-modal-backdrop"
                    role="presentation"
                    onMouseDown={(event) => {
                        if (
                            event.target ===
                            event.currentTarget
                        ) {
                            setComposeOpen(
                                false
                            );
                        }
                    }}
                >
                    <div
                        className="messages-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="new-conversation-title"
                    >
                        <header className="messages-modal-header">
                            <div>
                                <span className="messages-eyebrow">
                                    New conversation
                                </span>

                                <h2
                                    id="new-conversation-title"
                                >
                                    Message a client
                                </h2>

                                <p>
                                    Choose one of your
                                    photography clients.
                                </p>
                            </div>

                            <button
                                type="button"
                                className="messages-modal-close"
                                aria-label="Close"
                                onClick={() =>
                                    setComposeOpen(
                                        false
                                    )
                                }
                            >
                                <BiX
                                    aria-hidden="true"
                                />
                            </button>
                        </header>


                        <div className="messages-search messages-client-search">
                            <BiSearch
                                aria-hidden="true"
                            />

                            <input
                                type="search"
                                autoFocus
                                value={
                                    composeSearch
                                }
                                placeholder="Search clients..."
                                onChange={(
                                    event
                                ) =>
                                    setComposeSearch(
                                        event.target
                                            .value
                                    )
                                }
                            />
                        </div>


                        <div className="messages-client-list">

                            {!filteredClients
                                .length ? (
                                <div className="messages-modal-empty">
                                    <BiUser
                                        aria-hidden="true"
                                    />

                                    <h3>
                                        No clients found
                                    </h3>

                                    <p>
                                        {clients.length
                                            ? "Try a different search."
                                            : "Add a client before starting a conversation."}
                                    </p>
                                </div>
                            ) : (
                                filteredClients.map(
                                    (client) => {
                                        const existing =
                                            conversations.find(
                                                (
                                                    conversation
                                                ) =>
                                                    conversation.client_id ===
                                                    client.client_id
                                            );

                                        return (
                                            <button
                                                type="button"
                                                key={
                                                    client.client_id
                                                }
                                                className="messages-client-option"
                                                disabled={
                                                    creatingConversation
                                                }
                                                onClick={() =>
                                                    handleStartConversation(
                                                        client
                                                    )
                                                }
                                            >
                                                <div className="messages-avatar">
                                                    {getInitials(
                                                        client
                                                    )}
                                                </div>

                                                <div>
                                                    <strong>
                                                        {getClientName(
                                                            client
                                                        )}
                                                    </strong>

                                                    <span>
                                                        {client.email ||
                                                            "LensFlow client"}
                                                    </span>
                                                </div>

                                                <small>
                                                    {existing
                                                        ? "Open conversation"
                                                        : "Start conversation"}
                                                </small>
                                            </button>
                                        );
                                    }
                                )
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}