// import React, { useState } from 'react';
// import Homeimg from '../HomeBack.jpeg';
// import { Link } from 'react-router-dom';
// import '../App.css';

// const Header = () => {
//   const [isOpen, setIsOpen] = useState(false);

//   const toggleNavbar = () => {
//     setIsOpen(!isOpen);
//   };

//   return (
//     <div
//       className="fixed inset-0 bg-no-repeat bg-cover bg-center"
//       style={{ backgroundImage: `url(${Homeimg})` }}
//     >
//       <header className="bg-background/55 backdrop-blur-md flex flex-col sm:flex-row sm:justify-between sm:items-center px-4 py-3">
//         <div className="flex justify-between items-center">
//           <div className="text-white font-bold text-xl lg:px-20 xs:px-3">
//             <div className="lg:text-3xl md:text-2xl sm:text-xl font-bold text-gray-100 pr-5 lg:ml-10">
//               Lawvyas.ai
//             </div>
//           </div>
//           <button
//             type="button"
//             className="sm:hidden block text-gray-500 hover:text-white focus:text-white focus:outline-none"
//             onClick={toggleNavbar}
//           >
//             <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24">
//               {isOpen ? (
//                 <path
//                   fillRule="evenodd"
//                   clipRule="evenodd"
//                   d="M6 18L18 6M6 6l12 12"
//                 />
//               ) : (
//                 <path
//                   fillRule="evenodd"
//                   clipRule="evenodd"
//                   d="M4 6h16M4 12h16m-7 6h7"
//                 />
//               )}
//             </svg>
//           </button>
//         </div>

//         <nav
//           className={`sm:flex flex-col sm:flex-row sm:items-center sm:justify-between mt-4 sm:mt-0 ${isOpen ? 'block' : 'hidden'}`}
//         >
//           <ul className="flex flex-col sm:flex-row sm:items-center">
//             <li className="block text-gray-300 hover:text-white px-2 py-1 rounded-md text-lg font-medium">
//               <Link to="/About">About</Link>
//             </li>
//             <li className="block text-gray-300 hover:text-white px-2 py-1 rounded-md text-lg font-medium">
//               <Link to="/Demo">Services</Link>
//             </li>
//             <li className="block text-gray-300 hover:text-white px-2 py-1 rounded-md text-lg font-medium">
//               <Link to="/">Dashboard</Link>
//             </li>
//             <li className="block text-gray-300 hover:text-white px-2 py-1 rounded-md text-lg font-medium">
//               <Link to="/">.ai</Link>
//             </li>
//           </ul>
//         </nav>
//       </header>
//       <main className="px-4 py-8 flex justify-center items-center h-full">
//         <div className="w-full pr-8 pt-36 pl-20 xs:pt-20 text-center">
//           <h2 className="lg:text-8xl font-bold mb-4 xs:text-4xl text-yellow-100">
//             title content
//           </h2>
//           <p className="lg:text-3xl font-bold pt-20 text-gray-300 xs:text-sm">
//             Lorem Ipsum is simply dummy text of the printing
//             <br /> and typesetting industry.
//           </p>
//         </div>
//       </main>
//     </div>
//   );
// };

// export default Header;

import React, { useState } from 'react';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-orange-500 p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center">
          <div className="text-white font-bold">CLARA<br />THELLA</div>
        </div>
        <div className="hidden md:flex space-x-8">
          <a href="#" className="text-white hover:bg-orange-600 px-3 py-2 rounded-md">Home</a>
          <a href="#" className="text-white hover:bg-orange-600 px-3 py-2 rounded-md">About</a>
          <a href="#" className="text-white hover:bg-orange-600 px-3 py-2 rounded-md">Projects</a>
          <a href="#" className="text-white hover:bg-orange-600 px-3 py-2 rounded-md">Services</a>
          <a href="#" className="text-white hover:bg-orange-600 px-3 py-2 rounded-md">Blog</a>
        </div>
        <div className="hidden md:flex">
          <a href="#" className="text-white border border-white px-4 py-2 rounded-md hover:bg-orange-600">Contact me</a>
        </div>
        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)} className="text-white focus:outline-none">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
            </svg>
          </button>
        </div>
      </div>
      {isOpen && (
        <div className="md:hidden mt-2">
          <a href="#" className="block px-4 py-2 text-white hover:bg-orange-600">Home</a>
          <a href="#" className="block px-4 py-2 text-white hover:bg-orange-600">About</a>
          <a href="#" className="block px-4 py-2 text-white hover:bg-orange-600">Projects</a>
          <a href="#" className="block px-4 py-2 text-white hover:bg-orange-600">Services</a>
          <a href="#" className="block px-4 py-2 text-white hover:bg-orange-600">Blog</a>
          <a href="#" className="block px-4 py-2 text-white border border-white hover:bg-orange-600">Contact me</a>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
