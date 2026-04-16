import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { AdminShell } from "./gallery/admin/AdminShell.tsx";
import { EmailTemplatesPage } from "./gallery/admin/EmailTemplatesPage.tsx";
import { GalleryAuthWrapper } from "./gallery/admin/GalleryAuthWrapper.tsx";
import { GalleryCreateRedirect } from "./gallery/admin/GalleryCreateRedirect.tsx";
import { GalleryEditorPage } from "./gallery/admin/GalleryEditorPage.tsx";
import { GalleryListPage } from "./gallery/admin/GalleryListPage.tsx";
import { RequireAuth } from "./gallery/admin/RequireAuth.tsx";
import { ClientGalleryPage } from "./gallery/public/ClientGalleryPage.tsx";
import { PATH_LISTING_ADMIN } from "./paths.ts";
import { RootRedirect } from "./RootRedirect.tsx";
import {
  LegacyAdminRedirect,
  LegacyGalleryRedirect,
  LegacyListingAdminRedirect,
  LegacyListingMagiclinkRedirect,
} from "./LegacyRouteRedirects.tsx";
import "./index.css";
import "./styles.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Kein Element #root im HTML.");
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename="/selekto">
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          <Route path="/g/:slug" element={<LegacyGalleryRedirect />} />

          <Route path="/listing/admin/*" element={<LegacyListingAdminRedirect />} />

          <Route path="/bilder-auswahl" element={<GalleryAuthWrapper />}>
            <Route
              element={
                <RequireAuth>
                  <AdminShell />
                </RequireAuth>
              }
            >
              <Route index element={<GalleryListPage />} />
              <Route path="galleries/new" element={<GalleryCreateRedirect />} />
              <Route path="galleries/:id" element={<GalleryEditorPage />} />
              <Route path="templates" element={<EmailTemplatesPage />} />
            </Route>
          </Route>

          <Route path="/listing/magiclink/:slug" element={<LegacyListingMagiclinkRedirect />} />
          <Route path="/listing/:slug" element={<ClientGalleryPage />} />

          <Route path="/admin/*" element={<LegacyAdminRedirect />} />

          <Route path="*" element={<Navigate to={PATH_LISTING_ADMIN} replace />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
);
