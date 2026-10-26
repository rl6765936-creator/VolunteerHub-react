import { Link, NavLink } from "react-router";
import useAuth from "../hooks/useAuth";
import HeartIcon from "../design/HeartIcon";

const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();
  return (
    <header className="vh-header">
      <Link to="/" className="vh-brand">
        <span className="vh-brand__mark">
          <HeartIcon size={28} color="#E3304C" className="vh-beat" />
        </span>
        VolunteerHub
      </Link>

      <nav aria-label="Main navigation" className="vh-nav">
        <NavLink to="/requests" end className="vh-nav__link">בקשות עזרה</NavLink>

        {isAuthenticated ? (
          <>
            {user?.role === "USER" && (
              <>
            <NavLink to="/my-requests" className="vh-nav__link">הבקשות שלי</NavLink>
            <NavLink to="/requests/new" className="vh-nav__link">בקשה חדשה</NavLink>
            </>
            )}
            {user?.role === "ADMIN" && (
              <NavLink to="/admin/requests" className="vh-nav__link">ממתינות לאישור</NavLink>
            )}
            <span className="vh-hello">שלום, {user?.name}</span>
            <button type="button" className="vh-btn vh-btn--soft vh-btn--small" onClick={logout}>
              יציאה
            </button>
          </>
        ) : (
          <>
            <NavLink to="/login" className="vh-nav__link">התחברות</NavLink>
            <NavLink to="/register" className="vh-nav__link">הרשמה</NavLink>
          </>
        )}
      </nav>
    </header>
  );
};

export default Header;
