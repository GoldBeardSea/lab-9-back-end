'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
// app.use(express.static('./public'));

//database setup
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();


//constructor functions-------------------------------------------------------->
function Location(query, res) {
  this.search_query = query;
  this.formatted_query = res.results[0].formatted_address;
  this.latitude = res.results[0].geometry.location.lat;
  this.longitude = res.results[0].geometry.location.lng;
}

function Forecast(forecast, time) {
  this.forecast = forecast;
  this.time = time;
}

function Event(data){
  this.link = data.link;
  this.name = data.name.text;
  this.event_date = data.start.local;
  this.summary = data.summary;
}

function Movie(data){
  this.title = data.title;
  this.overview = data.overview;
  this.average_votes = data.vote_average;
  this.total_votes = data.vote_count;
  this.image_url = 'https://image.tmdb.org/t/p/w200' + data.poster_path;
  this.popularity = data.popularity;
  this.released_on = data.release_date;
}



app.get('/', (request, response) => response.send('server works'));
app.get('/location', getLocation);

function handleError(error) {
  return { 'status': 500, 'responseText': 'Sorry, something went wrong' };
}

function getLocation(request, response){
  const queryData = request.query.data;
  queryLocationDB(queryData, response);
}

function queryLocationDB(queryData, response){
  let sqlStatement = `SELECT * FROM locations WHERE search_query = $1;`;
  let values = [queryData];
  return client.query(sqlStatement, values)
    .then( data => {
      if(data.rowCount > 0) {
        response.send(data.rows[0]);
      } else {
        let geocodeURL = `https://maps.googleapis.com/maps/api/geocode/json?address=${queryData}&key=${process.env.GEOCODE_API_KEY}`;
        return superagent.get(geocodeURL)
          .then( res => {
            let location = new Location(queryData, res.body);
            let locationInsert = `INSERT INTO locations ( search_query, formatted_query, latitude, longitude) VALUES ( $1, $2, $3, $4);`;
            let values = [location.search_query, location.formatted_query, location.latitude, location.longitude];
            client.query(locationInsert, values);
            response.send(location);
          })
          .catch(error => handleError(error));
      }
    })
    .catch(error => handleError(error));
}

function lookupFunction(locationData, table, apiCall) {
  try {
    let sqlStatement = `SELECT * FROM ${table} WHERE location_id = $1;`;
    let values = [locationData.id];
    return client.query(sqlStatement, values).then(data => {
      if (data.rowCount > 0) {
        if ( (Date.now() - data.rows[0].time_created)  > 15 * 1000){
          return deleteThis(table, locationData.id).then(() => apiCall(locationData));
        }else {
          return data.rows;
        }
      } else {
        return apiCall(locationData);
      }
    });
  } catch (error) {
    response.status(500).send(handleError());
  }
}

function deleteThis (table, locationId){
  let deleteRow = `DELETE FROM ${table} WHERE location_id = ${locationId};`;
  return client.query(deleteRow);
}

app.get('/weather', (request, response) => {
  try {
    lookupFunction(request.query.data, 'weather', weatherApiCall)
      .then ( weatherData => {
        response.status(200).send(weatherData);
      });
  } catch (error) {
    console.log('Whoops');
    response.status(500).send(handleError());
  }
});

function weatherApiCall(locationData) {
  try {
    let weatherURL = `https://api.darksky.net/forecast/${process.env.WEATHER_API_KEY}/${request.query.data.latitude},${request.query.data.longitude}`;
    return superagent.get(weatherURL).then((weatherApiResponse) => {
      let weatherParsing = weatherApiResponse.body.daily.data.map(weatherResponseData => {
        return new Weather(weatherResponseData.summary, weatherResponseData.time);
      });
      weatherParsing.forEach(weatherEvent => {
        let weatherInsert = 'INSERT INTO weather (location_id, time_created, forecast, weather_time) VALUES ($1, $2, $3, $4);';
        let values = [locationData.id, Date.now(), weatherEvent.forecast, weatherEvent.time];
        client.query(weatherInsert, values);
      });
      return weatherParsing;
    });
  } catch(error){
    console.log(error);
    response.status(500).send(handleError());
  }
}

app.get('/movies', (request, response) => {
  try {
    lookupFunction(request.query.data, 'movies', movieApiCall)
      .then( filmData => {
        return response.status(200).send(filmData);
      });
  } catch (error) {
    console.log(error);
    response.status(500).send('There was an error on our end, sorry.');
  }
});

function movieApiCall (locationData) {
  try{
    let tmdbQuery = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&language=en-US&query=${locationData.search_query}&page=1&include_adult=false`;
    return superagent
      .get(tmdbQuery)
      .then( (movieApiResponse) => {
        let responseParsing = movieApiResponse.body.results.map( result => {
          return new Movie(result);
        });
        responseParsing.forEach( movie => {
          let insertMovies = 'INSERT INTO movies (location_id, created_at,movie_title, overview, avg_votes, total_votes, image_url, popularity, release_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);';
          let values = [locationData.id, Date.now(), movie.title, movie.overview, movie.average_votes, movie.total_votes, movie.image_url, movie.popularity, movie.release_date];
          client.query(insertMovies, values);
        });
        return responseParsing;
      });
  } catch(error){
    console.log('Error: ', error);
    response.status(500).send(handleError());
  }
}

app.get('/events', (request, response) => {
  try {
    let eventbriteURL = `https://www.eventbriteapi.com/v3/events/search?location.longitude=${request.query.filmData.longitude}&location.latitude=${request.query.data.latitude}&expand=venue`;
    superagent.get(eventbriteURL)
      .set('Authorization', `Bearer ${process.env.PERSONAL_TOKEN}`)
      .then( result => {
        const eventSummaries = result.body.events.map(item => {
          const summary = new Event(item);
        return summary;
        });
        response.send(eventSummaries);
      });
  } catch (error) {
    response.send(handleError());
  }
});

app.use('*', (request, response) => response.send('Sorry, that route does not exist.'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));