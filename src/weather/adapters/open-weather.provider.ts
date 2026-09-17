import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception';
import { ErrorCode } from '../../common/errors/error-code';
import { JsonHttpClient } from '../../common/http/json-http.client';
import { WeatherCoordinates, WeatherProvider } from '../ports/weather.provider';

const schema = z.object({
  name: z.string(),
  dt: z.number().int().positive(),
  main: z.object({
    temp: z.number(),
    feels_like: z.number(),
    humidity: z.number().min(0).max(100),
  }),
  weather: z.array(z.object({ description: z.string() })).min(1),
});

@Injectable()
export class OpenWeatherProvider extends WeatherProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly http: JsonHttpClient,
  ) {
    super();
  }
  async current(coordinates: WeatherCoordinates) {
    const apiKey = this.config.get<string>('WEATHER_API_KEY');
    if (!apiKey)
      throw new AppException(
        503,
        ErrorCode.WEATHER_NOT_CONFIGURED,
        'Weather provider is not configured',
      );
    const url = new URL('https://api.openweathermap.org/data/2.5/weather');
    url.search = new URLSearchParams({
      lat: String(coordinates.latitude),
      lon: String(coordinates.longitude),
      appid: apiKey,
      units: 'metric',
      lang: 'en',
    }).toString();
    try {
      const result = schema.parse(await this.http.request(url.toString()));
      return {
        location: result.name,
        temperatureCelsius: result.main.temp,
        feelsLikeCelsius: result.main.feels_like,
        humidityPercent: result.main.humidity,
        description: result.weather[0]!.description,
        observedAt: new Date(result.dt * 1000).toISOString(),
      };
    } catch {
      throw new AppException(502, ErrorCode.WEATHER_UNAVAILABLE, 'Weather provider is unavailable');
    }
  }
}
