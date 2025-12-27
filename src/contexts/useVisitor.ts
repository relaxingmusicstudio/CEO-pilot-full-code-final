import { useContext } from "react";
import { VisitorContext } from "@/contexts/VisitorContextBase";

export const useVisitor = () => {
  const context = useContext(VisitorContext);
  if (!context) {
    throw new Error("useVisitor must be used within a VisitorProvider");
  }
  return context;
};
