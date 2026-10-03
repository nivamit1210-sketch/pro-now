-- The professional's car and only the last 2-3 digits of its plate (audit v2 #8a). Additive and optional: every row stays as it is.
ALTER TABLE "professional_profiles"
  ADD COLUMN "vehicleHe" TEXT,
  ADD COLUMN "vehiclePlateTail" TEXT;

-- Never a full plate, whatever the code path: the database refuses anything but 2-3 digits.
ALTER TABLE "professional_profiles"
  ADD CONSTRAINT "professional_profiles_vehiclePlateTail_digits" CHECK ("vehiclePlateTail" IS NULL OR "vehiclePlateTail" ~ '^[0-9]{2,3}$');
