
import { useState } from "react";
import { Outlet } from "react-router-dom";
import { BiMenu as Menu } from "react-icons/bi";
import { useAuth } from "../context/authStore";

import PhotographerSidebar from "../components/PhotographerSidebar";
import ClientSidebar from "../components/ClientSidebar";
import Header from "../components/Header";

function AppLayout() {
  const { profile } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const closeSidebar = () => setIsSidebarOpen(false);

  return (
    <div className="app-layout">

      <Header />

      <button
        type="button"
        className="mobile-menu-toggle"
        aria-label="Open navigation menu"
        aria-expanded={isSidebarOpen}
        onClick={() => setIsSidebarOpen((isOpen) => !isOpen)}
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {isSidebarOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      {profile?.role === "photographer" && (
        <PhotographerSidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
        />
      )}

      {profile?.role === "client" && (
        <ClientSidebar
          isOpen={isSidebarOpen}
          onClose={closeSidebar}
        />
      )}

      {/* Current route/page */}
      <main className="main-content">
        <Outlet />
      </main>

    </div>
  );
}

export default AppLayout;
