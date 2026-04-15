import type { GetServerSideProps } from "next";

// Service Advisor has moved to the home page (/).
// This redirect keeps any old bookmarks or links working.
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/",
      permanent: true,
    },
  };
};

export default function ServiceAdvisorRedirect() {
  return null;
}
