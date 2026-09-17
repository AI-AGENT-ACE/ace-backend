import { Module } from '@nestjs/common';
import { HttpModule } from '../common/http/http.module';
import { OpenWeatherProvider } from './adapters/open-weather.provider';
import { WeatherProvider } from './ports/weather.provider';
import { WeatherService } from './weather.service';

@Module({
  imports: [HttpModule],
  providers: [WeatherService, { provide: WeatherProvider, useClass: OpenWeatherProvider }],
  exports: [WeatherService],
})
export class WeatherModule {}
