import "server-only";

import { notFound } from "next/navigation";

import { ActionError } from "@/lib/actions";

/**
 * Await a scoped module loader and turn "not found" and "forbidden" (a record of another institution, or
 * a batch an instructor is not assigned to) into a 404, so record ids never leak across organisations.
 */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ActionError && (error.code === "not_found" || error.code === "forbidden")) notFound();
    throw error;
  }
}
