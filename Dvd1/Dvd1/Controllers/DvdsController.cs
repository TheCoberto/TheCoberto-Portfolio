using System;
using System.Collections.Generic;
using System.Configuration;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Web.Http;
using System.Web.Http.Cors;
using Data;
using Data.Interfaces;
using Data.Repo;
using Models.Tables;

namespace Dvd1.Controllers
{
    [EnableCors(origins: "*", headers: "*", methods: "*")]
    public class DvdsController : ApiController
    {
        private IDvdsRepo repo = Factory.GetMode();

        [Route("dvds/")]
        [AcceptVerbs("GET")]
        public IHttpActionResult GetDvds()
        {

            

            List<Dvds> List = repo.GetDvds();

            return Ok(List);

        }

        [Route("dvds/title/{title}")]
        [AcceptVerbs("GET")]
        public IHttpActionResult GetDvdTitle(string title)
        {

           

            List<Dvds> List = repo.GetsDvdsTitle(title);

            return Ok(List);
        }
        [Route("dvds/year/{Year}")]
        [AcceptVerbs("GET")]
        public IHttpActionResult GetDvdsearchYear(string Year)
        {
           

            List<Dvds> List = repo.GetDvdsYear(Year);

            return Ok(List);
        }

        [Route("dvds/director/{Director}")]
        [AcceptVerbs("GET")]
        public IHttpActionResult GetDvdDirector(string Director)
        {
           

            List<Dvds> List = repo.GetDvdsDirector(Director);

            return Ok(List);
        }

        [Route("dvds/rating/{Rating}")]
        [AcceptVerbs("GET")]
        public IHttpActionResult GetDvdRating(string Rating)
        {
           

            List<Dvds> List = repo.GetDvdsRating(Rating);

            return Ok(List);
        }

        [Route("dvd/{dvdId}")]
        [AcceptVerbs("DELETE")]
        public IHttpActionResult deleteDVD(int dvdId)
        {
          

            repo.DeleteDvdId(dvdId);

            return Ok();

        }

        [Route("dvd/{dvdId}")]
        [AcceptVerbs("GET")]
        public IHttpActionResult displayDVD(int dvdId)
        {
           

            Dvds dvd = repo.GetDvdId(dvdId);

            return Ok(dvd);

        }

        [Route("dvd/{dvd}")]
        [AcceptVerbs("PUT")]
        public IHttpActionResult editDVDId(Dvds dvd)
        {
          

            repo.UpdateDvdId(dvd);

            Dvds newdvd = repo.GetDvdId(dvd.dvdId);

            return Ok(newdvd);

        }

        [Route("dvd")]
        [AcceptVerbs("POST")]
        public IHttpActionResult insertDVD(Dvds dvd)
        {
           

            repo.PostDvd(dvd);

            Dvds newdvd = repo.GetDvdId(dvd.dvdId);

            return Ok(newdvd);
        }

    }
}
