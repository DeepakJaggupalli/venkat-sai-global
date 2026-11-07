"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/db";
import { users } from "@/db/schema";
import { isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { getCurrentUser } from "@/modules/identity/session";

export async function setLocaleAction(locale: Locale): Promise<void> {
  if (!isLocale(locale)) return;
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365, httpOnly: false });
  const user = await getCurrentUser();
  if (user) await db.update(users).set({ locale }).where(eq(users.id, user.id));
}
