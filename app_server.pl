:- use_module(library(http/thread_httpd)).
:- use_module(library(http/http_dispatch)).
:- use_module(library(http/http_files)).
:- use_module(library(http/json)).
:- use_module(library(www_browser)).

:- consult('NaviProlog-System.pl').

:- dynamic server_started/0.

:- http_handler(root(health), handle_healthcheck, []).
:- http_handler(root(.), frontend_files, [prefix]).

handle_healthcheck(_Request) :-
    format('Content-type: application/json~n~n'),
    json_write(current_output, json([status=ok, message="Prolog Smart Route Server is running!"])).

start :-
    ensure_server,
    www_open_url('http://localhost:8080/').

start_server :-
    ensure_server,
    thread_get_message(_).

ensure_server :-
    server_started,
    !.
ensure_server :-
    server_port(Port),
    http_server(http_dispatch, [port(Port), bind_address('0.0.0.0')]),
    assertz(server_started).

server_port(Port) :-
    getenv('PORT', PortText),
    catch(( atom(PortText) -> atom_number(PortText, Port) ; number_string(Port, PortText) ), _, fail),
    !.
server_port(8080).

frontend_files(Request) :-
    memberchk(path(Path), Request),
    ( sub_atom(Path, 0, 4, _, '/api') ; sub_atom(Path, 0, 3, _, 'api') ),
    !,
    fail.

frontend_files(Request) :-
    memberchk(path('/'), Request),
    !,
    http_reply_file('index.html', [], Request).
frontend_files(Request) :-
    http_reply_from_files('.', [], Request).