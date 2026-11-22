/**
 * FinalAddress - the plain value classes shared by every address-search
 * provider (the packaged ones and a customer's own).
 *
 * They are `global` because FinalAddressProvider is global: a customer who
 * writes their own provider class in their org compiles against these. Keep
 * them small and additive; removing or renaming a global member breaks every
 * customer provider.
 */
global with sharing class FinalAddress {
    /** What the respondent typed, plus the provider billing session. */
    global class Query {
        global String text;
        /** Random id the browser makes per search box focus; Google bills one
         *  session per address when it is sent on suggest AND details. */
        global String sessionToken;
        /** A provider "group" id to open (Loqate containers); null normally. */
        global String container;
    }

    /** One row in the suggestion list. */
    global class Suggestion {
        @AuraEnabled
        global String id;
        @AuraEnabled
        global String title;
        @AuraEnabled
        global String subtitle;
        /** True when picking it opens a smaller list instead of an address. */
        @AuraEnabled
        global Boolean isGroup;
    }

    /** The picked address, already split into the Salesforce address parts. */
    global class Result {
        @AuraEnabled
        global String street;
        @AuraEnabled
        global String city;
        @AuraEnabled
        global String province;
        @AuraEnabled
        global String provinceCode;
        @AuraEnabled
        global String postalCode;
        @AuraEnabled
        global String country;
        @AuraEnabled
        global String countryCode;
        @AuraEnabled
        global Decimal latitude;
        @AuraEnabled
        global Decimal longitude;
    }

    /** Adapters throw this for a non-2xx answer so FinalAddressService can turn
     *  the HTTP status into one plain code. */
    global class ProviderException extends Exception {
        global Integer httpStatus;
    }

    /** A ProviderException carrying the status. This lives here, not on the
     *  exception class, because Apex does not allow static methods on inner
     *  classes. */
    global static ProviderException failed(Integer status) {
        ProviderException e = new ProviderException(
            'Provider answered ' + status
        );
        e.httpStatus = status;
        return e;
    }
}
