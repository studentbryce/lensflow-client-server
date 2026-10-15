import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  BiCalendar,
  BiCog,
  BiCollection,
  BiGroup,
  BiHomeAlt,
  BiImage,
  BiLogOut,
  BiMessageRounded,
  BiReceipt,
  BiSearchAlt,
  BiStar,
  BiBriefcase,
  BiX as X,
} from "react-icons/bi";
import { useAuth } from "./../context/authStore";
import brandLogo from "../assets/images/Lensflow_brand_logo-transparent.png";

function PhotographerSidebar({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const navLinkClass = ({ isActive }) =>
    `sidebar-link ${isActive ? "active" : ""}`;

  const handleLogout = async () => {
    try {
      await signOut();

      navigate("/", {
        replace: true,
      });
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <aside className={`sidebar photographer-sidebar ${isOpen ? "is-open" : ""}`}>

      <button
        type="button"
        className="sidebar-close"
        aria-label="Close navigation menu"
        onClick={onClose}
      >
        <X size={22} aria-hidden="true" />
      </button>

      {/* Logo / Brand */}
      <div className="sidebar-brand">
        <Link
          to="/"
          className="sidebar-brand-home"
          aria-label="Go to the LensFlow home page"
          onClick={onClose}
        >
          <img src={brandLogo} alt="LensFlow" />
        </Link>
        <span>Photographer</span>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav" onClick={onClose}>

        <NavLink to="/photographer" end className={navLinkClass}>
          <BiHomeAlt className="sidebar-link-icon" aria-hidden="true" />
          Dashboard
        </NavLink>

        {/* Business */}
        <div className="sidebar-section">
          <p className="sidebar-heading">BUSINESS</p>

          <NavLink
            to="/photographer/calendar"
            className={navLinkClass}
          >
            <BiCalendar className="sidebar-link-icon" aria-hidden="true" />
            Calendar
          </NavLink>

          <NavLink
            to="/photographer/bookings"
            className={navLinkClass}
          >
            <BiBriefcase className="sidebar-link-icon" aria-hidden="true" />
            Bookings
          </NavLink>

          <NavLink
            to="/photographer/clients"
            className={navLinkClass}
          >
            <BiGroup className="sidebar-link-icon" aria-hidden="true" />
            Clients
          </NavLink>

          <NavLink
            to="/photographer/services"
            className={navLinkClass}
          >
            <BiBriefcase className="sidebar-link-icon" aria-hidden="true" />
            Services
          </NavLink>

          <NavLink
            to="/photographer/invoices"
            className={navLinkClass}
          >
            <BiReceipt className="sidebar-link-icon" aria-hidden="true" />
            Invoices
          </NavLink>
        </div>

        {/* Media */}
        <div className="sidebar-section">
          <p className="sidebar-heading">MEDIA</p>

          <NavLink
            to="/photographer/galleries"
            className={navLinkClass}
          >
            <BiCollection className="sidebar-link-icon" aria-hidden="true" />
            Galleries
          </NavLink>

          <NavLink
            to="/photographer/portfolio"
            className={navLinkClass}
          >
            <BiImage className="sidebar-link-icon" aria-hidden="true" />
            Portfolio
          </NavLink>
        </div>

        {/* Website */}
        <div className="sidebar-section">
          <p className="sidebar-heading">WEBSITE</p>

          <NavLink
            to="/photographer/website"
            className={navLinkClass}
          >
            <BiSearchAlt className="sidebar-link-icon" aria-hidden="true" />
            Website Builder
          </NavLink>
        </div>

        {/* Communication */}
        <div className="sidebar-section">
          <p className="sidebar-heading">COMMUNICATION</p>

          <NavLink
            to="/photographer/messages"
            className={navLinkClass}
          >
            <BiMessageRounded className="sidebar-link-icon" aria-hidden="true" />
            Messages
          </NavLink>

          <NavLink
            to="/photographer/reviews"
            className={navLinkClass}
          >
            <BiStar className="sidebar-link-icon" aria-hidden="true" />
            Reviews
          </NavLink>
        </div>

        {/* Settings */}
        <div className="sidebar-section">
          <p className="sidebar-heading">SETTINGS</p>

          <NavLink
            to="/photographer/settings"
            className={navLinkClass}
          >
            <BiCog className="sidebar-link-icon" aria-hidden="true" />
            Settings
          </NavLink>
        </div>

      </nav>

      {/* Footer */}
      <div className="sidebar-footer">
        <button
          type="button"
          className="sidebar-link logout-link"
          onClick={handleLogout}
        >
          <BiLogOut className="sidebar-link-icon" aria-hidden="true" />
          Logout
        </button>
      </div>

    </aside>
  );
}

export default PhotographerSidebar;
