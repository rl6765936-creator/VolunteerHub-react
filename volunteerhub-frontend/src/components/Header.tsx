import { Link } from "react-router";
import useAuth from "../hooks/useAuth";

const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();

  return (
    <header>
      <nav aria-label="Main navigation">
        <Link to="/">  VolunteerHub  |</Link>

        {isAuthenticated ? (
          <>
            <span>Hello, {user?.name} |</span>
            <button type="button" onClick={logout}>
              Logout
            </button>
            <Link to="/my-requests">  My requests  |</Link>
            <Link to="/requests/new">  New request  |</Link>
            {user?.role === "ADMIN" && (
              <Link to="/admin/requests">  Pending requests (admin)  |</Link>
            )}
          </>
        ) : (
          <>
            <Link to="/login">  Login  |</Link>
            <Link to="/register">  Register  |</Link>
          </>
        )}
        <Link to="/requests">  Help requests  |</Link>
      </nav>
    </header>
  );
};

export default Header;