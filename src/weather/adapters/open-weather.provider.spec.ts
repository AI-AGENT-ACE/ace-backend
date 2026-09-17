import { ConfigService } from '@nestjs/config';
import { JsonHttpClient } from '../../common/http/json-http.client';
import { OpenWeatherProvider } from './open-weather.provider';

describe('OpenWeatherProvider', () => {
  const coordinates = { latitude: 37.5, longitude: 127 };
  it('reports missing configuration without inventing weather data', async () => {
    const http = { request: jest.fn() };
    const provider = new OpenWeatherProvider(
      { get: () => undefined } as unknown as ConfigService,
      http as unknown as JsonHttpClient,
    );
    await expect(provider.current(coordinates)).rejects.toMatchObject({
      response: { code: 'WEATHER_NOT_CONFIGURED' },
    });
    expect(http.request).not.toHaveBeenCalled();
  });
  it('sanitizes upstream errors that contain secrets', async () => {
    const provider = new OpenWeatherProvider(
      { get: () => 'private-api-key' } as unknown as ConfigService,
      {
        request: jest.fn().mockRejectedValue(new Error('Upstream secret: private-api-key')),
      } as unknown as JsonHttpClient,
    );
    await expect(provider.current(coordinates)).rejects.toMatchObject({
      response: { code: 'WEATHER_UNAVAILABLE', message: 'Weather provider is unavailable' },
    });
  });
  it('validates and maps a successful provider response', async () => {
    const provider = new OpenWeatherProvider(
      { get: () => 'private-api-key' } as unknown as ConfigService,
      {
        request: jest.fn().mockResolvedValue({
          name: 'Seoul',
          dt: 1760000000,
          main: { temp: 23, feels_like: 22, humidity: 50 },
          weather: [{ description: 'clear' }],
        }),
      } as unknown as JsonHttpClient,
    );
    expect(await provider.current(coordinates)).toMatchObject({
      location: 'Seoul',
      temperatureCelsius: 23,
      feelsLikeCelsius: 22,
      humidityPercent: 50,
    });
  });
});
