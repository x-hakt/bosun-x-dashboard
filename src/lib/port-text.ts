import type { LogEntry, PortShip } from "@/lib/port-core";

// IDEA-20: shared wording for the port's text, used by the scene (client) and the rolling
// log (server) alike.
export const PORT_TZ = "Australia/Sydney";
export const clockText = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { timeZone: PORT_TZ, hour: "2-digit", minute: "2-digit", hour12: false });
export const shipNameOf = (ships: PortShip[], key?: string) => (key ? ships.find((s) => s.key === key)?.name ?? "a ship" : "the harbour");
// Mid-sentence the rowing boat is "the rowing boat", not a proper name.
export const entryText = (e: LogEntry, ships: PortShip[]) => e.action.replace("{ship}", e.ship === "~dinghy" ? "the rowing boat" : shipNameOf(ships, e.ship));
