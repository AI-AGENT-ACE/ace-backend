import { Injectable } from '@nestjs/common';
import { WeatherCoordinates, WeatherProvider } from './ports/weather.provider';

@Injectable()
export class WeatherService {
  constructor(private readonly provider: WeatherProvider) {}
  current(coordinates: WeatherCoordinates) {
    return this.provider.current(coordinates);
  }
}
