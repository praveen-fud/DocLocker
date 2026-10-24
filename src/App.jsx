import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { StudentProvider, useStudent } from "./context/StudentContext";
import { BrandProvider } from "./context/BrandContext";
import Home from "./pages/Home/Home";
import "./index.css";
import "./theme/orbit.css";

// Heavy pages loaded only when actually navigated to
const Portal       = lazy(() => import("./pages/Portal/Portal"));
const Admin        = lazy(() => import("./pages/Admin/Admin"));
const AdminLogin   = lazy(() => import("./pages/AdminLogin/AdminLogin"));
const BankerPortal = lazy(() => import("./pages/BankerPortal/BankerPortal"));

function PageLoader() {
  return (
    <div role="status" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "var(--text-muted)", fontSize: 14 }}>
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

// A fresh Home per company link, so nothing from one company's page
// (advisors, branding) carries over to another or to the main site.
function CompanyHome() {
  const { companySlug } = useParams();
  return <Home key={companySlug} />;
}

function AppRoutes() {
  // Every screen owns its chrome: Home has the marketing header, the student
  // portal its top navigation, and the staff/banker dashboards their sidebars.
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/"              element={<Home key="main" />} />
        <Route path="/c/:companySlug" element={<CompanyHome />} />
        <Route path="/portal"        element={<ProtectedPortal />} />
        <Route path="/admin"         element={<ProtectedAdmin />} />
        <Route path="/admin-login"   element={<AdminLogin />} />
        <Route path="/banker-portal" element={<ProtectedBankerPortal />} />
        <Route path="*"              element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <StudentProvider>
        <BrandProvider>
          <AppRoutes />
        </BrandProvider>
      </StudentProvider>
    </BrowserRouter>
  );
}
