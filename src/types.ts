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

export interface UnomiContext {
    sessionId: string;
    profileId: string;
    source: {
        itemId: string;
        itemType: string;
        scope: string;
    };
    requiredProfileProperties?: string[];
    requiredSessionProperties?: string[];
    requireSegments?: boolean;
    requireScores?: boolean;
    events?: any[];
}

export interface GetMyProfileArgs {
    requireSegments?: boolean;
    requireScores?: boolean;
}

export interface UpdateMyProfileArgs {
    properties: {
        [key: string]: string | number | boolean | null;
    };
}

export interface UnomiScope {
    itemId: string;
    itemType: string;
    metadata: {
        id:string,
        name?: string;
        description?: string;
        scope: string;
    };
}

export interface CreateScopeArgs {
    scope: string;
    name?: string;
    description?: string;
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

// Type guard for get my profile arguments
export function isValidGetMyProfileArgs(args: any): args is GetMyProfileArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        (args.requireSegments === undefined || typeof args.requireSegments === "boolean") &&
        (args.requireScores === undefined || typeof args.requireScores === "boolean")
    );
}

// Type guard for update my profile arguments
export function isValidUpdateMyProfileArgs(args: any): args is UpdateMyProfileArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "properties" in args &&
        typeof args.properties === "object" &&
        args.properties !== null &&
        Object.entries(args.properties).every(([_, value]) => 
            value === null || 
            typeof value === "string" || 
            typeof value === "number" || 
            typeof value === "boolean"
        )
    );
}

// Type guard for create scope arguments
export function isValidCreateScopeArgs(args: any): args is CreateScopeArgs {
    return (
        typeof args === "object" &&
        args !== null &&
        "scope" in args &&
        typeof args.scope === "string" &&
        (args.name === undefined || typeof args.name === "string") &&
        (args.description === undefined || typeof args.description === "string")
    );
}

// Helper function to generate session ID with date
export function generateSessionId(profileId: string): string {
    const now = new Date();
    const datePart = now.toISOString().split('T')[0].replace(/-/g, '');
    return `${profileId}-${datePart}`;
}
