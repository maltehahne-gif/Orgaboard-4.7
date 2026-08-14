import React, { useRef, useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function SalesReportPage() {

  const sheetRef = useRef<HTMLDivElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [sales] = useState([
    {
      customer: "Max Mustermann",
      product: "Produkt A",
      amount: 2,
      revenue: 120
    },
    {
      customer: "Firma Beispiel",
      product: "Produkt B",
      amount: 5,
      revenue: 450
    }
  ]);


  async function exportPdf() {

    if (!sheetRef.current) {
      alert("Keine Verkaufstabelle gefunden.");
      return;
    }

    setPdfBusy(true);

    try {

      const canvas = await html2canvas(sheetRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff"
      });


      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4"
      });


      const img = canvas.toDataURL("image/png");

      const width = pdf.internal.pageSize.getWidth();
      const height = (canvas.height * width) / canvas.width;


      pdf.addImage(
        img,
        "PNG",
        10,
        10,
        width - 20,
        height
      );


      const date = new Date()
        .toLocaleDateString("de-DE")
        .replace(/\./g,"-");


      pdf.save(`Verkaufstabelle_${date}.pdf`);

    } catch(error) {

      console.error(error);
      alert("PDF konnte nicht erstellt werden.");

    } finally {

      setPdfBusy(false);

    }
  }


  return (

    <div className="sales-report-page">

      <h1>Verkaufsbericht</h1>


      <div ref={sheetRef} className="sales-week-sheet">

        <h2>Verkaufstabelle</h2>


        <table className="sales-week-table">

          <thead>
            <tr>
              <th>Kunde</th>
              <th>Produkt</th>
              <th>Menge</th>
              <th>Umsatz</th>
            </tr>
          </thead>


          <tbody>

            {sales.map((sale,index)=>(

              <tr key={index}>
                <td>{sale.customer}</td>
                <td>{sale.product}</td>
                <td>{sale.amount}</td>
                <td>{sale.revenue} €</td>
              </tr>

            ))}

          </tbody>

        </table>

      </div>


      <button onClick={exportPdf} disabled={pdfBusy}>

        {pdfBusy
          ? "PDF wird erstellt..."
          : "PDF exportieren"
        }

      </button>


    </div>

  );
}




