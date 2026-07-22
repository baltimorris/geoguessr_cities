library(httr)
library(jsonlite)
library(readr)
library(dplyr)

# Pushes a generated round up to the app so phones can play it.
# Run after 02_locations.R has written locations.csv for the round.
# Needs SUPABASE_KEY in .Renviron (the publishable key from the supabase dashboard).
#
# Runs on its own, no need to source 00_parameters.R first. If you did source it,
# whatever it set for city/round_no/output_location is kept.

supabase_url <- "https://qilhfautteplyqnqgfgv.supabase.co"
supabase_key <- Sys.getenv("SUPABASE_KEY")

# >>> set this to the code the admin panel shows before running <<<
game_code <- "ABCD"

if (!exists("city")) city <- "DC"          # DC or NYC
if (!exists("round_no")) round_no <- 1
if (!exists("output_location")) output_location <- file.path(getwd(), city, "output")

if (supabase_key == "") {
  stop("No SUPABASE_KEY. Add SUPABASE_KEY=... to ~/.Renviron and restart R.")
}

locations_csv <- file.path(output_location, paste0("Round ", round_no), "locations.csv")
if (!file.exists(locations_csv)) {
  stop("No locations.csv at ", locations_csv,
       "\nSet output_location to your ", city, "/output folder, or run 02_locations.R first.")
}

locations_upload <- read_csv(locations_csv, show_col_types = FALSE) %>%
  select(seq = seqnum, lat = latitude, lng = longitude) %>%
  mutate(round = round_no)

# codes get reused once a game finishes, so only look at the one still running
resp <- GET(
  paste0(supabase_url, "/rest/v1/games?code=eq.", game_code,
         "&status=neq.finished&select=id&order=created_at.desc&limit=1"),
  add_headers(apikey = supabase_key, Authorization = paste("Bearer", supabase_key))
)
found <- fromJSON(content(resp, "text", encoding = "UTF-8"))
game_id <- if (length(found) == 0) NULL else found$id[1]

if (is.null(game_id)) {
  stop("No live game found with code ", game_code, ". Create it in the app's admin panel first.")
}

locations_upload$game_id <- game_id

resp <- POST(
  paste0(supabase_url, "/rest/v1/locations"),
  add_headers(apikey = supabase_key,
              Authorization = paste("Bearer", supabase_key),
              `Content-Type` = "application/json",
              Prefer = "return=minimal"),
  body = toJSON(locations_upload, auto_unbox = TRUE)
)

if (status_code(resp) < 300) {
  message("Uploaded ", nrow(locations_upload), " locations to game ", game_code, "!")
} else {
  message("Upload failed: ", status_code(resp), " ", content(resp, "text", encoding = "UTF-8"))
}
