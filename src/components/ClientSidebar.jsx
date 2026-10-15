import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  BiCalendar,
  BiCollection,
  BiHomeAlt,
  BiLogOut,
  BiMessageRounded,
  BiReceipt,
  BiStar,
  BiUser,
  BiX as X,
} from "react-icons/bi";
import { useAuth } from "./../context/authStore";
import brandLogo from "../assets/images/Lensflow_brand_logo-transparent.png";

function ClientSidebar({ isOpen, onClose }) {
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
    <aside className={`sidebar client-sidebar ${isOpen ? "is-open" : ""}`}>
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
        <span>Client</span>
      </div>

      {/* Main Navigation */}
      <nav className="sidebar-nav" onClick={onClose}>
        <NavLink to="/client" end className={navLinkClass}>
          <BiHomeAlt className="sidebar-link-icon" aria-hidden="true" />
          Dashboard
        </NavLink>

        {/* My Photographer */}
        <div className="sidebar-section">
          <p className="sidebar-heading">MY PHOTOGRAPHER</p>

          <NavLink to="/client/bookings" className={navLinkClass}>
            <BiCalendar className="sidebar-link-icon" aria-hidden="true" />
            My Bookings
          </NavLink>

          <NavLink to="/client/galleries" className={navLinkClass}>
            <BiCollection className="sidebar-link-icon" aria-hidden="true" />
            My Galleries
          </NavLink>

          <NavLink to="/client/reviews" className={navLinkClass}>
            <BiStar className="sidebar-link-icon" aria-hidden="true" />
            My Reviews
          </NavLink>

          <NavLink to="/client/invoices" className={navLinkClass}>
            <BiReceipt className="sidebar-link-icon" aria-hidden="true" />
            My Invoices
          </NavLink>

          <NavLink to="/client/messages" className={navLinkClass}>
            <BiMessageRounded
              className="sidebar-link-icon"
              aria-hidden="true"
            />
            Messages
          </NavLink>
        </div>

        {/* Account */}
        <div className="sidebar-section">
          <p className="sidebar-heading">ACCOUNT</p>

          <NavLink to="/client/profile" className={navLinkClass}>
            <BiUser className="sidebar-link-icon" aria-hidden="true" />
            My Profile
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

export default ClientSidebar;
