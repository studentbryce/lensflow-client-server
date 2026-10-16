import { useCallback, useEffect, useState } from "react";
import {
	BiBell,
	BiUser,
} from "react-icons/bi";
import { Link } from "react-router-dom";

import { useAuth } from "../context/authStore";
import { supabase } from "../lib/supabaseClient";
import { apiGetUnreadMessageCount } from "../services/photographerMessagesApi";

import brandLogo from "../assets/images/Lensflow_brand_logo-transparent.png";


function Header() {
	const { profile } = useAuth();

	const [isCompact, setIsCompact] = useState(false);
	const [unreadMessageCount, setUnreadMessageCount] = useState(0);


	/* =========================================================
	   Responsive header
	   ========================================================= */

	useEffect(() => {
		const mediaQuery = window.matchMedia("(max-width: 650px)");

		const updateCompactState = () => {
			setIsCompact(mediaQuery.matches);
		};

		updateCompactState();

		mediaQuery.addEventListener(
			"change",
			updateCompactState
		);

		return () => {
			mediaQuery.removeEventListener(
				"change",
				updateCompactState
			);
		};
	}, []);


	/* =========================================================
	   Role / route helpers
	   ========================================================= */

	const roleLabel =
		profile?.role === "photographer"
			? "Photographer"
			: "Client";


	const messagesPath =
		profile?.role === "photographer"
			? "/photographer/messages"
			: "/client/messages";


	const profilePath =
		profile?.role === "photographer"
			? "/photographer/settings"
			: "/client/profile";


	/* =========================================================
	   Load unread message count
	   ========================================================= */

	const loadUnreadMessageCount = useCallback(async () => {
		try {
            const response = await apiGetUnreadMessageCount();
            setUnreadMessageCount(response.data?.count ?? 0);
		} catch (error) {
			console.error(
				"Unable to load unread message count:",
				error
			);
		}
	}, []);


	/* =========================================================
	   Initial unread count
	   ========================================================= */

	useEffect(() => {
		if (!profile?.role) return undefined;

		let active = true;
		async function loadInitialUnreadCount() {
			try {
				const response = await apiGetUnreadMessageCount();
				if (active) setUnreadMessageCount(response.data?.count ?? 0);
			} catch (error) {
				if (active) console.error("Unable to load unread message count:", error);
			}
		}

		void loadInitialUnreadCount();
		return () => { active = false; };
	}, [profile?.role]);


	/* =========================================================
	   Realtime unread updates
	   ========================================================= */

	useEffect(() => {
		if (!profile?.role) {
			return undefined;
		}


		const channel = supabase
			.channel("header-message-notifications")

			/*
			 * New incoming message.
			 */
			.on(
				"postgres_changes",
				{
					event: "INSERT",
					schema: "public",
					table: "messages",
				},
				() => {
					loadUnreadMessageCount();
				}
			)

			/*
			 * A message may have been marked read.
			 */
			.on(
				"postgres_changes",
				{
					event: "UPDATE",
					schema: "public",
					table: "messages",
				},
				() => {
					loadUnreadMessageCount();
				}
			)

			.subscribe();


		return () => {
			supabase.removeChannel(channel);
		};
	}, [
		profile?.role,
		loadUnreadMessageCount,
	]);


	/* =========================================================
	   Render
	   ========================================================= */

	return (
		<header className="top-header">

			{/* Mobile brand */}
			<span className="top-header-brand">
				<img
					src={brandLogo}
					alt=""
					aria-hidden="true"
				/>
			</span>


			<div className="top-header-actions">

				{/* Role */}
				<span
					className="top-header-role"
					aria-hidden={isCompact}
				>
					{roleLabel}
				</span>


				{/* Message notifications */}
				<Link
					to={messagesPath}
					className="top-header-notification"
					aria-label={
						unreadMessageCount > 0
							? `${unreadMessageCount} unread message${
									unreadMessageCount === 1
										? ""
										: "s"
							  }`
							: "Open messages"
					}
					title={
						unreadMessageCount > 0
							? `${unreadMessageCount} unread message${
									unreadMessageCount === 1
										? ""
										: "s"
							  }`
							: "Messages"
					}
				>
					<BiBell
						size={23}
						aria-hidden="true"
					/>

					{unreadMessageCount > 0 && (
						<span
							className="top-header-notification-badge"
							aria-hidden="true"
						>
							{unreadMessageCount > 99
								? "99+"
								: unreadMessageCount}
						</span>
					)}
				</Link>


				{/* Profile */}
				<Link
					to={profilePath}
					className="top-header-profile"
					aria-label="Open profile"
					title="Open profile"
				>
					<BiUser
						size={24}
						aria-hidden="true"
					/>
				</Link>

			</div>

		</header>
	);
}


export default Header;