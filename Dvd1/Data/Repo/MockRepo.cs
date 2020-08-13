using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Data.Interfaces;
using Models.Tables;

namespace Data.Repo
{
    public class MockRepo : IDvdsRepo
    {
        public void DeleteDvdId(int dvdId)
        {
            throw new NotImplementedException();
        }

        public Dvds GetDvdId(int dvdId)
        {
            Dvds dvd = new Dvds();

            if (dvdId == 1)
            {
                dvd.dvdId = 1;
                dvd.title = "King Kong";
                dvd.releaseYear = "2009";
                dvd.director = "Peter Jackson";
                dvd.rating = "R";
                dvd.notes = "Good, but long.";
            }

            return dvd;
        }

        public List<Dvds> GetDvds()
        {
            throw new NotImplementedException();
        }

        public List<Dvds> GetDvdsDirector(string director)
        {
            throw new NotImplementedException();
        }

        public List<Dvds> GetDvdsRating(string rating)
        {
            throw new NotImplementedException();
        }

        public List<Dvds> GetDvdsYear(string releaseYear)
        {
            throw new NotImplementedException();
        }

        public List<Dvds> GetsDvdsTitle(string title)
        {
            throw new NotImplementedException();
        }

        public void PostDvd(Dvds dvd)
        {
            throw new NotImplementedException();
        }

        public void UpdateDvdId(Dvds dvd)
        {
            throw new NotImplementedException();
        }
    }
}
