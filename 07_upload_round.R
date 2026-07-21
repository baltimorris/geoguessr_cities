library(httr)
library(jsonlite)
library(readr)
library(dplyr)

# Pushes a generated round up to the app so phones can play it.
# Run after 02_locations.R has written locations.csv for the round.
# Needs SUPABASE_KEY in .Renviron (the publishable key from the supabase dashboard).

supabase_url <- "https://qilhfautteplyqnqgfgv.supabase.co"
supabase_key <- Sys.getenv("SUPABASE_KEY")

# >>> set this to the code the admin panel shows before running <<<
game_code <- "ABCD"

locations_upload <- read_csv(paste0(output_location, "Round ", round_no, "/locations.csv")) %>%
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
