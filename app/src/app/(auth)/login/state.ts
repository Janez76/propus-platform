/**
 * Geteilte Typen/Konstanten für die Login-Seite.
 *
 * Bewusst KEINE `"use server"`-Datei: aus Server-Actions-Modulen dürfen nur
 * async-Funktionen exportiert werden — daher leben `LoginState` und
 * `INITIAL_STATE` hier, nicht in `actions.ts`. (Ein `export`-Objekt in
 * `actions.ts` lässt `next build` durch, crasht aber beim ersten Request der
 * dynamischen `/login`-Route → 500.)
 */

export type LoginState = {
  ok: boolean;
  error: string | null;
  field?: "email" | "password" | "form";
  token?: string;
  role?: string;
  permissions?: string[];
  remember?: boolean;
  target?: string;
};

export const INITIAL_STATE: LoginState = { ok: false, error: null };
