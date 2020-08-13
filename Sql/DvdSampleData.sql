use dvd1
go

if exists(select * from INFORMATION_SCHEMA.ROUTINES
	where ROUTINE_NAME = 'DBReset')
	drop procedure DBReset
GO

Create procedure DBReset as
begin
	delete from Dvds;
	delete from Ratings

	DBCC CHECKIDENT (Dvds, reseed,0)

	insert into Ratings (rating)
	Values
	('G'),
	('PG'),
	('PG-13'),
	('R'),
	('X');

	insert into Dvds (title, releaseYear, director, rating, notes)
	values
	('HelloWorld','2009', 'Wonky Kong', 'G', 'Test'),
	('HelloFriend','2008', 'Jon Hastings', 'X', 'Test'),
	('HelloBoy','2007', 'Tony The Tiger ', 'PG-13', 'Test'),
	('HelloGirl','2012', 'Fart Knocker', 'R', 'Test');

	end
	go
