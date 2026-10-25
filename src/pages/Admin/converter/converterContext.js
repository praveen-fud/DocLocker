// The File Converter's shared state: open the radial menu for some files
// from anywhere in the staff workspace.
import { createContext, useContext } from "react";

export const ConverterContext = createContext(null);

export const useConverter = () => useContext(ConverterContext);
