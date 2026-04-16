import { Outlet } from "react-router-dom";
import { GalleryAuthProvider } from "../auth/GalleryAuthContext.tsx";

export function GalleryAuthWrapper() {
  return (
    <GalleryAuthProvider>
      <Outlet />
    </GalleryAuthProvider>
  );
}
