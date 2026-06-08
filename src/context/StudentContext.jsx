/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";

const StudentContext = createContext(null);

// Admin session TTL: 8 hours in milliseconds
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Check whether a stored admin session is still valid.
 * Returns true only if the session exists AND has not expired.
 */
function isAdminSessionValid() {
  try {
    const raw = localStorage.getItem("abroad_admin_session");
    if (!raw) return false;
    const { active, expiresAt } = JSON.parse(raw);
    return active === true && Date.now() < expiresAt;
  } catch {
    return false;
  }
}

export function StudentProvider({ children }) {
  // Lazy initialization – reads localStorage synchronously on first render
  const [student, setStudentState] = useState(() => {
    try {
      const saved = localStorage.getItem("abroad_student");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // FIX: Admin session now uses a timestamped object with expiry
  // instead of a plain "true" string, preventing indefinite sessions.
  const [isAdmin, setIsAdmin] = useState(() => isAdminSessionValid());

  const setStudent = (data) => {
    setStudentState(data);
    localStorage.setItem("abroad_student", JSON.stringify(data));
  };

  const clearStudent = () => {
    setStudentState(null);
    localStorage.removeItem("abroad_student");
  };

  const loginAdmin = () => {
    setIsAdmin(true);
    localStorage.setItem(
      "abroad_admin_session",
      JSON.stringify({
        active: true,
        expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
      }),
    );
    // Remove old format key if present from a previous version
    localStorage.removeItem("abroad_admin");
  };

  const logoutAdmin = () => {
    setIsAdmin(false);
    localStorage.removeItem("abroad_admin_session");
    localStorage.removeItem("abroad_admin"); // clean up old key too
  };

  /**
   * Re-validates the admin session on each render cycle.
   * If the TTL has elapsed since login, auto-logs out the admin.
   */
  const checkAdminSession = () => {
    if (isAdmin && !isAdminSessionValid()) {
      logoutAdmin();
      return false;
    }
    return isAdmin;
  };

  return (
    <StudentContext.Provider
      value={{
        student,
        setStudent,
        clearStudent,
        isAdmin: checkAdminSession(),
        loginAdmin,
        logoutAdmin,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export const useStudent = () => useContext(StudentContext);
