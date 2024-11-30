export interface UnomiProfile {
    itemId: string;
    properties: {
        firstName?: string;
        lastName?: string;
        email?: string;
        [key: string]: any;
    };
    segments: string[];
    scores: {
        [key: string]: number;
    };
    consents: {
        [key: string]: {
            status: string;
            timestamp: number;
        };
    };
    systemProperties: {
        [key: string]: any;
    };
}

export interface GetProfileArgs {
    profileId: string;
}

export interface SearchProfilesArgs {
    query: string;
    limit?: number;
    offset?: number;
}

// Type guard for get profile arguments
export function isValidGetProfileArgs(args: any): args is GetProfileArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "profileId" in args &&
        typeof args.profileId === "string"
    );
}

// Type guard for search profiles arguments
export function isValidSearchProfilesArgs(args: any): args is SearchProfilesArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "query" in args &&
        typeof args.query === "string" &&
        (args.limit === undefined || typeof args.limit === "number") &&
        (args.offset === undefined || typeof args.offset === "number")
    );
}
