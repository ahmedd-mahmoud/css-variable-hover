export interface VariableDefinition {
  value: string;
  source: string;
  mediaQuery?: string;
}

export interface VariableCache {
  [key: string]: VariableDefinition[];
}

export interface WatchedFiles {
  additionalFiles: string[];
}

export interface TailwindCustomClasses {
  [key: string]: {
    prefix: string;
    className: string;
    variable: string;
    source: string;
  };
}
