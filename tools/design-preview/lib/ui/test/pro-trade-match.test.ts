/**
 * HOW A PROFESSIONAL DESCRIBES HIMSELF, FOR EVERY TRADE.
 *
 * Amit, joining as a vet in front of investors (2026-09-30): *"רשמתי חנות
 * חיות — לא מצא. רשמתי וטרינר … חייב אותי לבחור פתיחת סתימה."* The join
 * form ticks what it understood from his own words. Every trade we have is
 * written here the way its people say it, and each must find its own
 * services — and nothing from another trade.
 */
import { describe, expect, test } from "vitest";
import { matchServicesByText } from "../src/service-match";
import { catalogMatchRules } from "../src/catalog/catalogAdapter";

const PLUMB = ["svc-blockage", "svc-leak", "svc-tap"];
const ELEC = ["svc-electric", "svc-socket"];
const LOCK = ["svc-lock", "svc-cylinder", "svc-car-lockout"];
const PETS = ["svc-dog-walk", "svc-pet-sit", "svc-pet-groom", "svc-vet"];
const ROAD = ["svc-jump-start", "svc-flat-tyre", "svc-car-lockout", "svc-towing"];

const CASES: Array<[string, string[]]> = [
  ["אינסטלטור", PLUMB], ["אני אינסטלטור", PLUMB], ["שרברב", PLUMB], ["פותח סתימות", ["svc-blockage"]],
  ["חשמלאי", ELEC], ["אני חשמלאי מוסמך", ELEC], ["חשמלאית", ELEC],
  ["מנעולן", LOCK], ["פורץ מנעולים", LOCK],
  ["טכנאי גז", ["svc-gas"]], ["גזאי", ["svc-gas"]],
  ["טכנאי מזגנים", ["svc-ac"]], ["מיזוג אוויר", ["svc-ac"]],
  ["טכנאי מקררים", ["svc-fridge"]], ["טכנאי מכונות כביסה", ["svc-washer"]],
  ["מנקה", ["svc-clean", "svc-clean-reno"]], ["עוזרת בית", ["svc-clean", "svc-clean-reno"]], ["ניקיון אחרי שיפוץ", ["svc-clean-reno", "svc-clean"]],
  ["מדביר", ["svc-pest"]], ["הדברה", ["svc-pest"]],
  ["גנן", ["svc-garden"]], ["גינון", ["svc-garden"]],
  ["ספר", ["svc-haircut"]], ["ספרית", ["svc-haircut"]], ["מספרה", ["svc-haircut", "svc-pet-groom"]],
  ["מניקוריסטית", ["svc-nails"]], ["לק ג'ל", ["svc-nails"]],
  ["מאפרת", ["svc-makeup"]], ["איפור כלות", ["svc-makeup"]],
  ["מאמן כושר", ["svc-trainer"]], ["מאמנת אישית", ["svc-trainer"]],
  ["מעסה", ["svc-massage"]], ["מטפל בעיסוי", ["svc-massage"]],
  ["רופא", ["svc-doctor"]], ["רופאת משפחה", ["svc-doctor"]],
  ["דוג ווקר", ["svc-dog-walk"]], ["פט סיטר", ["svc-pet-sit"]], ["מספרת כלבים", ["svc-pet-groom"]],
  ["וטרינר", ["svc-vet"]], ["וטרינרית", ["svc-vet"]], ["רופא חיות", ["svc-vet"]],
  ["חנות חיות", PETS], ["יש לי חנות לחיות", PETS], ["חיות מחמד", PETS],
  ["גרר", ["svc-towing"]], ["גרירה", ["svc-towing"]], ["חילוץ רכב", ROAD], ["פנצ'ריה", ["svc-flat-tyre"]], ["התנעה", ["svc-jump-start"]],
  ["שליח", ["svc-courier"]], ["שליחויות", ["svc-courier"]],
  ["מוביל", ["svc-moving"]], ["הובלות", ["svc-moving"]],
  ["טכנאי מחשבים", ["svc-computer"]], ["מתקן טלפונים", ["svc-phone-fix"]], ["טכנאי סלולר", ["svc-phone-fix"]],
  ["הנדימן", ["svc-handyman", "svc-hands"]], ["איש אחזקה", ["svc-handyman", "svc-hands"]],
  ["מורה פרטי", ["svc-tutor"]], ["מורה למתמטיקה", ["svc-tutor"]],
  ["צבעי", ["svc-paint"]], ["צבע", ["svc-paint"]],
  ["רצף", ["svc-tiling"]], ["גבסן", ["svc-drywall"]], ["טייח", ["svc-drywall"]],
  ["נגר", ["svc-carpentry", "svc-furniture"]], ["הרכבת רהיטים", ["svc-furniture"]],
  ["תליית טלוויזיה", ["svc-tv"]], ["וילונות", ["svc-curtains"]], ["אלומיניום", ["svc-glass"]], ["זגג", ["svc-glass"]],
  ["מתקין אזעקות", ["svc-alarm"]], ["מצלמות אבטחה", ["svc-alarm"]],
  ["איטום", ["svc-sealing"]], ["איטום גגות", ["svc-sealing"]],
  ["דודי שמש", ["svc-solar"]], ["טכנאי דודים", ["svc-solar"]],
];

describe("a professional's own words find his own trade", () => {
  for (const [words, expected] of CASES) {
    test(words, () => {
      const got = matchServicesByText(words, catalogMatchRules).map((m) => m.serviceId);
      expect(got.length, `"${words}" found nothing`).toBeGreaterThan(0);
      expect(got.filter((id) => !expected.includes(id)), `"${words}" also found`).toEqual([]);
    });
  }
});
