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
    if (!raw) return null;
    const { role } = JSON.parse(raw);
    return role || null;
  } catch {
    return null;
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

function getStoredAdminName() {
  try {
    const raw = localStorage.getItem("abroad_admin_session");
    if (!raw) return "";
    const { adminName } = JSON.parse(raw);
    return adminName || "";
  } catch {
    return "";
  }
}

function getStoredAdminToken() {
  try {
    const raw = localStorage.getItem("abroad_admin_session");
    if (!raw) return "";
    const { token } = JSON.parse(raw);
    return token || "";
  } catch {
    return "";
  }
}

function getStoredAdminBank() {
  try {
    const raw = localStorage.getItem("abroad_admin_session");
    if (!raw) return "";
    const { adminBank } = JSON.parse(raw);
    return adminBank || "";
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
    isAdminSessionValid() ? getStoredAdminRole() : null,
  );
  const [adminAdvisorName, setAdminAdvisorName] = useState(() =>
    isAdminSessionValid() ? getStoredAdvisorName() : "",
  );
  const [adminName, setAdminName] = useState(() =>
    isAdminSessionValid() ? getStoredAdminName() : "",
  );
  const [adminToken, setAdminToken] = useState(() =>
    isAdminSessionValid() ? getStoredAdminToken() : "",
  );
  const [adminBank, setAdminBank] = useState(() =>
    isAdminSessionValid() ? getStoredAdminBank() : "",
  );

  const setStudent = (data) => {
    setStudentState(data);
    localStorage.setItem("abroad_student", JSON.stringify(data));
  };

  const clearStudent = () => {
    setStudentState(null);
    localStorage.removeItem("abroad_student");
  };

  // role: "superadmin" | "advisor" | "banker"
  // advisorName: the advisor's name (same as adminName for advisors)
  // name: the login name of this admin
  // token: JWT from backend
  // bank: the bank name for banker accounts
  const loginAdmin = (role = "superadmin", advisorName = "", name = "", token = "", bank = "") => {
    setIsAdmin(true);
    setAdminRole(role);
    setAdminAdvisorName(advisorName);
    setAdminName(name);
    setAdminToken(token);
    setAdminBank(bank);
    localStorage.setItem(
      "abroad_admin_session",
      JSON.stringify({
        active: true,
        role,
        advisorName,
        adminName: name,
        token,
        adminBank: bank,
        expiresAt: Date.now() + ADMIN_SESSION_TTL_MS,
      }),
    );
    localStorage.removeItem("abroad_admin");
  };

  const logoutAdmin = () => {
    setIsAdmin(false);
    setAdminRole(null);
    setAdminAdvisorName("");
    setAdminName("");
    setAdminToken("");
    setAdminBank("");
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
        adminRole: validSession ? adminRole : null,
        adminAdvisorName: validSession ? adminAdvisorName : "",
        adminName: validSession ? adminName : "",
        adminToken: validSession ? adminToken : "",
        adminBank: validSession ? adminBank : "",
        loginAdmin,
        logoutAdmin,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export const useStudent = () => useContext(StudentContext);
