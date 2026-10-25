import { Route, Routes } from "react-router"
import Home from "../pages/Home"
import Login from "../pages/Login"
import ProtectedRoute from "../components/ProtectedRoute"
import Register from "../pages/Register"
import HelpRequestsPage from "../pages/HelpRequestsPage"
import MyHelpRequestsPage from "../pages/MyHelpRequestsPage"
import CreateHelpRequestPage from "../pages/CreateHelpRequestPage"
import EditHelpRequestPage from "../pages/EditHelpRequestPage"
import AdminHelpRequestsPage from "../pages/AdminHelpRequestsPage"

const Router = () => {

    return (<>
        <Routes>
            <Route element={<ProtectedRoute />}>
                <Route path="/my-requests" element={<MyHelpRequestsPage />} />
                <Route path="/requests/new" element={<CreateHelpRequestPage />} />
                <Route path="/requests/:id/edit" element={<EditHelpRequestPage />} />
            </Route>
            <Route element={<ProtectedRoute requiredRole="ADMIN" />}>
                <Route path="/admin/requests" element={<AdminHelpRequestsPage />} />
            </Route>
            <Route path="/" element={<Home />} />
            <Route path="/Login" element={<Login />} />
            <Route path="/Register" element={<Register />} />
            <Route path="/requests" element={<HelpRequestsPage />} />
        </Routes>
    </>)
}
export default Router
