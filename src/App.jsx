import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StudentProvider, useStudent } from "./context/StudentContext";
import Navbar from "./components/Navbar/Navbar";
import Home from "./pages/Home/Home";
import Portal from "./pages/Portal/Portal";
import Admin from "./pages/Admin/Admin";
import AdminLogin from "./pages/AdminLogin/AdminLogin";
import "./index.css";

function ProtectedPortal() {
  const { student } = useStudent();
  return student ? <Portal /> : <Navigate to="/" replace />;
}

function ProtectedAdmin() {
  const { isAdmin } = useStudent();
  return isAdmin ? <Admin /> : <Navigate to="/admin-login" replace />;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/portal" element={<ProtectedPortal />} />
        <Route path="/admin" element={<ProtectedAdmin />} />
        <Route path="/admin-login" element={<AdminLogin />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StudentProvider>
        <AppRoutes />
      </StudentProvider>
    </BrowserRouter>
  );
}
