import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { StudentProvider, useStudent } from "./context/StudentContext";
import Navbar from "./components/Navbar/Navbar";
import Home from "./pages/Home/Home";
import "./index.css";

// Heavy pages loaded only when actually navigated to
const Portal       = lazy(() => import("./pages/Portal/Portal"));
const Admin        = lazy(() => import("./pages/Admin/Admin"));
const AdminLogin   = lazy(() => import("./pages/AdminLogin/AdminLogin"));
const BankerPortal = lazy(() => import("./pages/BankerPortal/BankerPortal"));

function PageLoader() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "var(--gray-400)", fontSize: 14 }}>
      Loading…
    </div>
  );
}

function ProtectedPortal() {
  const { student } = useStudent();
  return student ? <Portal /> : <Navigate to="/" replace />;
}

function ProtectedAdmin() {
  const { isAdmin, adminRole } = useStudent();
  if (!isAdmin) return <Navigate to="/admin-login" replace />;
  if (adminRole === "banker") return <Navigate to="/banker-portal" replace />;
  return <Admin />;
}

function ProtectedBankerPortal() {
  const { isAdmin, adminRole } = useStudent();
  if (!isAdmin) return <Navigate to="/admin-login" replace />;
  if (adminRole !== "banker") return <Navigate to="/admin" replace />;
  return <BankerPortal />;
}

function AppRoutes() {
  return (
    <>
      <Navbar />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/"              element={<Home />} />
          <Route path="/portal"        element={<ProtectedPortal />} />
          <Route path="/admin"         element={<ProtectedAdmin />} />
          <Route path="/admin-login"   element={<AdminLogin />} />
          <Route path="/banker-portal" element={<ProtectedBankerPortal />} />
          <Route path="*"              element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
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
