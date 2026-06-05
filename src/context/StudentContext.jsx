/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from "react";

const StudentContext = createContext(null);

export function StudentProvider({ children }) {
  // Lazy initialization – reads localStorage synchronously on first render,
  // avoids using useEffect and the setState‑in‑effect warning
  const [student, setStudentState] = useState(() => {
    try {
      const saved = localStorage.getItem("abroad_student");
      return saved ? JSON.parse(saved) : null;
    } catch {
      // Malformed JSON – ignore and return null
      return null;
    }
  });

  const [isAdmin, setIsAdmin] = useState(() => {
    try {
      const admin = localStorage.getItem("abroad_admin");
      return admin === "true";
    } catch {
      return false;
    }
  });

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
    localStorage.setItem("abroad_admin", "true");
  };

  const logoutAdmin = () => {
    setIsAdmin(false);
    localStorage.removeItem("abroad_admin");
  };

  return (
    <StudentContext.Provider
      value={{
        student,
        setStudent,
        clearStudent,
        isAdmin,
        loginAdmin,
        logoutAdmin,
      }}
    >
      {children}
    </StudentContext.Provider>
  );
}

export const useStudent = () => useContext(StudentContext);
