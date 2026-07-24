import type {HttpClient} from '../runtime/http-client.js';
import type {RuntimeEnvironment} from '../runtime/environment-parser.js';

export interface HttpProviderDependencies {
  environment: RuntimeEnvironment;
  http: HttpClient;
}
