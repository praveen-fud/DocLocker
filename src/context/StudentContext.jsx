/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";

const StudentContext = createContext(null);

// Admin session TTL: 8 hours in milliseconds
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

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

function getStoredAdminRole() {
  try {
    const raw = localStorage.getItem("abroad_admin_session");
    if (!raw) return "superadmin";
    const { role } = JSON.parse(raw);
    return role || "superadmin";
  } catch {
    return "superadmin";
  }
}

function getStoredAdvisorName() {
  try {
    const raw = localStorage.getItem("abroad_admin_session");
    if (!raw) return "";
    const { advisorName } = JSON.parse(raw);
    return advisorName || "";
  } catch {
    return "";
  }
}

export function StudentProvider({ children }) {
  const [student, setStudentState] = useState(() => {
    try {
      const saved = localStorage.getItem("abroad_student");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [isAdmin, setIsAdmin] = useState(() => isAdminSessionValid());
  const [adminRole, setAdminRole] = useState(() =>
    isAdminSessionValid() ? getStoredAdminRole() : "superadmin",
  );
  const [adminAdvisorName, setAdminAdvisorName] = useState(() =>
    isAdminSessionValid() ? getStoredAdvisorName() : "",
  );

  const setStudent = (data) => {
    setStudentState(data);
    localStorage.setItem("abroad_student", JSON.stringify(data));
  };

  const clearStudent = () => {
    setStudentState(null);
    localStorage.removeItem("abroad_student");
  };

  // role: "superadmin" | "advisor"
  // advisorName: "Sainath" | "Shravan" | ""
  const loginAdmin = (role = "superadmin", advisorName = "") => {
    setIsAdmin(true);
    setAdminRole(role);
    setAdminAdvisorName(advisorName);
    localStorage.setItem(
      "abroad_admin_session",
      JSON.stringify({
        active: true,
        role,
        advisorName,
        expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
      }),
    );
    localStorage.removeItem("abroad_admin");
  };

  const logoutAdmin = () => {
    setIsAdmin(false);
    setAdminRole("superadmin");
    setAdminAdvisorName("");
    localStorage.removeItem("abroad_admin_session");
    localStorage.removeItem("abroad_admin");
  };

  const checkAdminSession = () => {
    if (isAdmin && !isAdminSessionValid()) {
      logoutAdmin();
      return false;
    }
    return isAdmin;
  };

  const validSession = checkAdminSession();

  return (
    <StudentContext.Provider
      value={{
        student,
        setStudent,
        clearStudent,
        isAdmin: validSession,
        adminRole: validSession ? adminRole : "superadmin",
        adminAdvisorName: validSession ? adminAdvisorName : "",
        loginAdmin,
        logoutAdmin,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export const useStudent = () => useContext(StudentContext);
