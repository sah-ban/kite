# Offline city data

`cities.json` is derived from the [GeoNames cities15000 export](https://download.geonames.org/export/dump/cities15000.zip), retrieved on 22 October 2026. GeoNames includes cities with more than 15,000 inhabitants and national capitals in this export. Each row keeps only latitude, longitude, city name, and ISO country code; the remaining source fields are omitted.

Data credit: [GeoNames](https://www.geonames.org/), licensed under [Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/). The data is provided without guarantees of accuracy or completeness. Kite's MIT license does not replace the dataset's license.

The server finds the closest listed city within 25 km using great-circle distance. It prefixes results farther than 10 km with “Near”. This provides an approximate location, without detecting municipal boundaries or street addresses. No location lookup sends coordinates to an external service. The browser's map link opens OpenStreetMap only when selected.

To refresh the bundled snapshot from the repository root:

```bash
curl --fail --location https://download.geonames.org/export/dump/cities15000.zip -o /tmp/cities15000.zip
unzip -p /tmp/cities15000.zip cities15000.txt > /tmp/cities15000.txt
node scripts/build-city-data.mjs /tmp/cities15000.txt
```

Update the retrieval date above, then commit the refreshed data. No download runs during app builds or startup.
