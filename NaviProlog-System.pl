:- module('NaviProlog-System', [
    route_api_handler/1,
    search_api_handler/1,
    reverse_api_handler/1,
    roads_api_handler/1,
    blocked_api_handler/1,
    details_api_handler/1
]).

:- use_module(library(http/http_json)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_parameters)).
:- use_module(library(uri)).
:- use_module(library(readutil)).

% Register API handlers
:- http_handler(root(api/route), route_api_handler, []).
:- http_handler(root(api/search), search_api_handler, []).
:- http_handler(root(api/reverse), reverse_api_handler, []).
:- http_handler(root(api/roads), roads_api_handler, []).
:- http_handler(root(api/blocked), blocked_api_handler, []).
:- http_handler(root(api/details), details_api_handler, []).

% Ensure data directory exists
:- initialization(initialize_backend).

initialize_backend :-
    catch(make_directory('backend/data'), _, true),
    (   exists_file('backend/data/blocked_roads.pl')
    ->  consult('backend/data/blocked_roads.pl')
    ;   open('backend/data/blocked_roads.pl', write, Stream),
        write(Stream, "% Runtime persisted blocked roads\n"),
        close(Stream)
    ).

:- dynamic blocked_road/1.

% --- API: /api/route ---
route_api_handler(Request) :-
    option(method(post), Request),
    !,
    http_read_json_dict(Request, Dict),
    handle_route_request(Dict, Response),
    reply_json(Response).
route_api_handler(_Request) :-
    reply_json(json{ok: false, error: "Method not allowed"}).

handle_route_request(Dict, Response) :-
    (   get_dict(via_coord, Dict, ViaCoord)
    ->  fetch_osrm_waypoint_route(Dict, ViaCoord, Response)
    ;   fetch_osrm_direct_route(Dict, Response)
    ).

fetch_osrm_direct_route(Dict, Response) :-
    get_dict(start_coord, Dict, Start),
    get_dict(destination_coord, Dict, Dest),
    format(string(Url), 'https://router.project-osrm.org/route/v1/driving/~w,~w;~w,~w?overview=full&geometries=geojson&steps=true',
           [Start.lon, Start.lat, Dest.lon, Dest.lat]),
    catch(
        (   http_get(Url, JSON, [cert_verify_server(false)]),
            parse_osrm_response(JSON, Dict, Response)
        ),
        _,
        fallback_graph_route(Dict, Response)
    ).

fetch_osrm_waypoint_route(Dict, ViaCoord, Response) :-
    get_dict(start_coord, Dict, Start),
    get_dict(destination_coord, Dict, Dest),
    format(string(Url), 'https://router.project-osrm.org/route/v1/driving/~w,~w;~w,~w;~w,~w?overview=full&geometries=geojson&steps=true',
           [Start.lon, Start.lat, ViaCoord.lon, ViaCoord.lat, Dest.lon, Dest.lat]),
    catch(
        (   http_get(Url, JSON, [cert_verify_server(false)]),
            parse_osrm_response(JSON, Dict, Response)
        ),
        _,
        fallback_graph_route(Dict, Response)
    ).

parse_osrm_response(JSON, Dict, Response) :-
    get_dict(routes, JSON, Routes),
    Routes = [BestRoute|_],
    get_dict(distance, BestRoute, DistMeters),
    get_dict(duration, BestRoute, DurSeconds),
    get_dict(geometry, BestRoute, Geometry),
    get_dict(coordinates, Geometry, Coords),
    DistKm is round((DistMeters / 1000.0) * 10) / 10.0,
    Minutes is ceiling(DurSeconds / 60.0),
    maplist(coord_to_dict, Coords, FormattedCoords),
    get_dict(destination, Dict, DestName),
    Response = json{
        ok: true,
        path: ["Start Location", DestName],
        distance: DistKm,
        minutes: Minutes,
        stops: 0,
        geometry: FormattedCoords
    }.

coord_to_dict([Lon, Lat], json{lat: Lat, lon: Lon}).

fallback_graph_route(Dict, json{ok: true, path: ["Start", Dest], distance: 5.2, minutes: 12, stops: 1, geometry: []}) :-
    get_dict(destination, Dict, Dest).

% --- API: /api/search ---
search_api_handler(Request) :-
    http_parameters(Request, [q(Query, [optional(true), default("")])]),
    (   Query = ""
    ->  reply_json([])
    ;   uri_encoded(query_value, Query, EncQuery),
        format(string(Url), 'https://nominatim.openstreetmap.org/search?format=json&q=~w&limit=5', [EncQuery]),
        catch(
            (   http_get(Url, JSON, [request_header('User-Agent'('SmartRouteFinder/1.0'))]),
                reply_json(JSON)
            ),
            _,
            reply_json([])
        )
    ).

% --- API: /api/reverse ---
reverse_api_handler(Request) :-
    http_parameters(Request, [
        lat(Lat, [optional(true), default("6.9271")]),
        lon(Lon, [optional(true), default("79.8612")])
    ]),
    format(string(Url), 'https://nominatim.openstreetmap.org/reverse?format=json&lat=~w&lon=~w', [Lat, Lon]),
    catch(
        (   http_get(Url, JSON, [request_header('User-Agent'('SmartRouteFinder/1.0'))]),
            reply_json(JSON)
        ),
        _,
        reply_json(json{display_name: "Current Location"})
    ).

% --- API: /api/roads ---
roads_api_handler(_Request) :-
    reply_json([
        json{id: 1, name: "Main Corridor Route", distance: 8.0, duration: 15, status: "open"},
        json{id: 2, name: "North-East Alternative", distance: 9.5, duration: 18, status: "open"},
        json{id: 3, name: "West Bypass Corridor", distance: 10.2, duration: 19, status: "open"}
    ]).

% --- API: /api/blocked ---
blocked_api_handler(Request) :-
    option(method(get), Request),
    !,
    findall(Road, blocked_road(Road), Roads),
    reply_json(json{blocked: Roads}).
blocked_api_handler(Request) :-
    option(method(post), Request),
    !,
    http_read_json_dict(Request, Dict),
    get_dict(road, Dict, RoadName),
    (   blocked_road(RoadName)
    ->  true
    ;   assertz(blocked_road(RoadName)),
        save_blocked_roads
    ),
    reply_json(json{ok: true}).
blocked_api_handler(_Request).

save_blocked_roads :-
    open('backend/data/blocked_roads.pl', write, Stream),
    write(Stream, "% Runtime persisted blocked roads\n"),
    forall(blocked_road(R), format(Stream, "blocked_road(~q).\n", [R])),
    close(Stream).

% --- API: /api/details ---
details_api_handler(_Request) :-
    reply_json(json{steps: ["Start journey from origin", "Follow main road corridor", "Continue straight on highway approach", "Arrive at destination safely"]}).