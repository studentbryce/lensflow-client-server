import { useCallback, useEffect, useRef, useState } from "react";
import {
	BiBell,
	BiCog,
	BiLogOut,
	BiUser,
} from "react-icons/bi";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../context/authStore";
import { supabase } from "../lib/supabaseClient";
import { apiGetUnreadMessageCount } from "../services/photographerMessagesApi";

import brandLogo from "../assets/images/Lensflow_brand_logo-transparent.png";


function Header() {
	const { profile, signOut } = useAuth();
	const navigate = useNavigate();
	const profileMenuRef = useRef(null);

	const [isCompact, setIsCompact] = useState(false);
	const [unreadMessageCount, setUnreadMessageCount] = useState(0);
	const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
	const [isSigningOut, setIsSigningOut] = useState(false);


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


	const isPhotographer = profile?.role === "photographer";
	const accountPath = isPhotographer
		? "/photographer/settings"
		: "/client/profile";

	useEffect(() => {
		if (!isProfileMenuOpen) return undefined;

		function handlePointerDown(event) {
			if (!profileMenuRef.current?.contains(event.target)) {
				setIsProfileMenuOpen(false);
			}
		}

		function handleEscape(event) {
			if (event.key === "Escape") {
				setIsProfileMenuOpen(false);
				profileMenuRef.current?.querySelector(".top-header-profile")?.focus();
			}
		}

		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [isProfileMenuOpen]);

	async function handleLogout() {
		if (isSigningOut) return;
		setIsSigningOut(true);
		try {
			await signOut();
			setIsProfileMenuOpen(false);
			navigate("/", { replace: true });
		} catch (error) {
			console.error("Logout failed:", error);
		} finally {
			setIsSigningOut(false);
		}
	}


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


				{/* Profile actions */}
				<div className="top-header-profile-container" ref={profileMenuRef}>
					<button
						type="button"
						className="top-header-profile"
						aria-label="Account menu"
						aria-haspopup="true"
						aria-expanded={isProfileMenuOpen}
						aria-controls="top-header-account-menu"
						onClick={() => setIsProfileMenuOpen((open) => !open)}
					>
						<BiUser size={24} aria-hidden="true" />
					</button>
					{isProfileMenuOpen && (
						<div id="top-header-account-menu" className="top-header-profile-menu" aria-label="Account actions">
							<Link to={accountPath} className="top-header-profile-menu-item" onClick={() => setIsProfileMenuOpen(false)}>
								{isPhotographer ? <BiCog aria-hidden="true" /> : <BiUser aria-hidden="true" />}
								{isPhotographer ? "Settings" : "My Profile"}
							</Link>
							<div className="top-header-profile-menu-divider" />
							<button type="button" className="top-header-profile-menu-item top-header-profile-menu-logout" onClick={handleLogout} disabled={isSigningOut}>
								<BiLogOut aria-hidden="true" /> {isSigningOut ? "Signing out..." : "Log out"}
							</button>
						</div>
					)}
				</div>

			</div>

		</header>
	);
}


export default Header;
