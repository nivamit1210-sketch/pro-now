-- The address box's "contains" search reads this index instead of scanning
-- every street on every keystroke (src/domain/streets/search.ts).

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "street_names_search_trgm" ON "street_names" USING GIN ("searchText" gin_trgm_ops);
