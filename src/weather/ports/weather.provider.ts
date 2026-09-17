export interface WeatherCoordinates {
  latitude: number;
  longitude: number;
}
export interface CurrentWeather {
  location: string;
  temperatureCelsius: number;
  feelsLikeCelsius: number;
  humidityPercent: number;
  description: string;
  observedAt: string;
}

export abstract class WeatherProvider {
  abstract current(coordinates: WeatherCoordinates): Promise<CurrentWeather>;
}
