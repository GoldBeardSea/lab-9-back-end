DROP TABLE IF EXISTS weather, events, movies, locations;


CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  search_query VARCHAR(255),
  formatted_query VARCHAR(255),
  latitude DECIMAL,
  longitude DECIMAL
);

CREATE TABLE IF NOT EXISTS weather(
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id),
  time_created BIGINT,
  forecast VARCHAR(255),
  weather_time VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS events(
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id),
  time_created BIGINT,
  link VARCHAR(255),
  event_name VARCHAR(255),
  event_date CHAR(15),
  summary TEXT
);

CREATE TABLE IF NOT EXISTS movies(
  id SERIAL PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id),
  time_created BIGINT,
  movie_title VARCHAR(255),
  overview TEXT,
  avg_votes NUMERIC,
  total_votes NUMERIC,
  image_url VARCHAR(255),
  popularity NUMERIC,
  release_date DATE
);
